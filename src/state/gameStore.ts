/**
 * アプリ全体の状態。
 *
 * ・ゲームの進行（開始 → 取得 → 終了 → 結果）
 * ・プロフィール／図鑑／プレイ履歴の保存と復帰
 *
 * 時間の判定はすべて「終了時刻 (endsAt)」との比較で行う。
 * こうしておくと、アプリを閉じても・バックグラウンドへ回っても
 * 残り時間がずれない。
 */
import { create } from 'zustand'
import { GAME_RULES, LOCATION_RULES } from '@/config/gameConfig'
import { evaluateCaptureEligibility } from '@/domain/capture'
import { distanceMeters as distanceBetween, type LatLng } from '@/domain/geo'
import { buildHandHints } from '@/domain/handHints'
import { calculateScore } from '@/domain/scoring'
import type { HandHint, PlaceCard, ScoreBreakdown } from '@/domain/types'
import { findCard } from '@/state/cards'
import { cardsOf, nearbyCards, type NearbyCard } from '@/state/selectors'
import { loadJson, saveJson, removeKey, STORAGE_KEYS, clearAll } from '@/services/storage'
import { submitScore } from '@/services/ranking'
import type { GeoFix } from '@/services/geolocation'
import type {
  ActiveSession,
  DexEntry,
  FinishReason,
  GamePhase,
  GameResult,
  PlayRecord,
  Profile,
} from '@/state/types'

export { ALL_CARDS, findCard } from '@/state/cards'

/* ---------------- 既定値 ---------------- */

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

function createProfile(): Profile {
  return {
    userId: createId('user'),
    userName: 'プレイヤー',
    totalPlays: 0,
    bestScore: 0,
    createdAt: Date.now(),
  }
}

/* ---------------- ストア ---------------- */

export interface CaptureFeedback {
  card: PlaceCard
  at: number
}

interface GameState {
  ready: boolean
  phase: GamePhase
  profile: Profile
  dex: Record<string, DexEntry>
  history: PlayRecord[]
  session: ActiveSession | null
  result: GameResult | null
  /** 取得演出のためのきっかけ */
  captureFeedback: CaptureFeedback | null
  /** 現在地 */
  fix: GeoFix | null
  now: number

  init: () => void
  setUserName: (name: string) => void
  updateFix: (fix: GeoFix | null) => void
  tick: () => void
  startGame: () => void
  captureCard: (cardId: string) => { ok: boolean; message: string }
  finishGame: (reason: FinishReason) => void
  abortGame: () => void
  dismissResult: () => void
  clearCaptureFeedback: () => void
  resetAllData: () => void
  /** 開発用：残り時間を上書きする */
  devSetRemainingSeconds: (seconds: number) => void
}

export const useGameStore = create<GameState>((set, get) => ({
  ready: false,
  phase: 'idle',
  profile: createProfile(),
  dex: {},
  history: [],
  session: null,
  result: null,
  captureFeedback: null,
  fix: null,
  now: Date.now(),

  init: () => {
    if (get().ready) return
    const profile = normalizeProfile(loadJson<Partial<Profile>>(STORAGE_KEYS.profile, {}))
    const dex = loadJson<Record<string, DexEntry>>(STORAGE_KEYS.dex, {})
    const history = loadJson<PlayRecord[]>(STORAGE_KEYS.history, [])
    const session = loadJson<ActiveSession | null>(STORAGE_KEYS.activeSession, null)

    set({
      ready: true,
      profile,
      dex: isPlainObject(dex) ? dex : {},
      history: Array.isArray(history) ? history : [],
      now: Date.now(),
    })
    saveJson(STORAGE_KEYS.profile, profile)

    if (session && isValidSession(session)) {
      set({ session, phase: 'playing' })
      // 閉じている間に時間切れになっていた場合は、そのまま結果へ進む
      if (Date.now() >= session.endsAt) get().finishGame('timeup')
    } else if (session) {
      removeKey(STORAGE_KEYS.activeSession)
    }
  },

  setUserName: (name) => {
    const trimmed = name.trim().slice(0, 12)
    const profile = { ...get().profile, userName: trimmed || 'プレイヤー' }
    set({ profile })
    saveJson(STORAGE_KEYS.profile, profile)
  },

  updateFix: (fix) => {
    const previous = get().fix
    set({ fix, now: Date.now() })

    // 移動距離の加算（ゲーム中のみ）
    const session = get().session
    if (!fix || !session || get().phase !== 'playing') return
    if (fix.accuracy > LOCATION_RULES.movementMaxAccuracyMeters) return

    const from = session.lastPoint ?? previous?.coords ?? null
    if (!from) {
      updateSession(set, get, { lastPoint: fix.coords })
      return
    }
    const step = distanceBetween(from, fix.coords)
    if (step < LOCATION_RULES.minMovementStepMeters) return
    updateSession(set, get, {
      lastPoint: fix.coords,
      distanceMeters: session.distanceMeters + step,
    })
  },

  tick: () => {
    const now = Date.now()
    set({ now })
    const { session, phase } = get()
    if (phase === 'playing' && session && now >= session.endsAt) get().finishGame('timeup')
  },

  startGame: () => {
    const now = Date.now()
    const fix = get().fix
    const session: ActiveSession = {
      id: createId('game'),
      startedAt: now,
      endsAt: now + GAME_RULES.durationMinutes * 60 * 1000,
      captured: [],
      distanceMeters: 0,
      lastPoint: fix?.coords ?? null,
    }
    set({ session, phase: 'playing', result: null, now })
    saveJson(STORAGE_KEYS.activeSession, session)
  },

  captureCard: (cardId) => {
    const { session, phase, fix } = get()
    const card = findCard(cardId)
    if (!card) return { ok: false, message: 'カードが見つかりませんでした' }

    const alreadyCaptured = session?.captured.some((entry) => entry.cardId === cardId) ?? false
    const distance = fix ? distanceBetween(fix.coords, { lat: card.lat, lng: card.lng }) : null
    const eligibility = evaluateCaptureEligibility({
      distanceMeters: distance,
      accuracyMeters: fix?.accuracy ?? null,
      alreadyCaptured,
      handFull: (session?.captured.length ?? 0) >= GAME_RULES.handSize,
      playing: phase === 'playing' && session !== null,
    })
    if (!eligibility.canCapture || !session) {
      return { ok: false, message: '取得できませんでした' }
    }

    const captured = [
      ...session.captured,
      { cardId, capturedAt: Date.now(), distanceAtCapture: Math.round(distance ?? 0) },
    ]
    updateSession(set, get, { captured })
    set({ captureFeedback: { card, at: Date.now() } })

    if (captured.length >= GAME_RULES.handSize) {
      // 演出を見せてから結果画面へ
      setTimeout(() => {
        if (get().phase === 'playing') get().finishGame('complete')
      }, 1_200)
    }
    return { ok: true, message: `${card.name} を取得しました` }
  },

  finishGame: (reason) => {
    const { session, profile, dex, history } = get()
    if (!session) return

    const cards = session.captured
      .map((entry) => findCard(entry.cardId))
      .filter((card): card is PlaceCard => card !== undefined)
    const score = calculateScore(cards)
    const playedAt = Date.now()
    const durationSeconds = Math.max(0, Math.round((playedAt - session.startedAt) / 1000))
    const previousBest = profile.bestScore

    const record: PlayRecord = {
      id: session.id,
      playedAt,
      score: score.finalScore,
      cardIds: cards.map((card) => card.id),
      cardNames: cards.map((card) => card.name),
      bestHandName: score.bestHand?.name ?? '',
      handNames: score.hands.map((hand) => hand.name),
      cardTotal: score.cardTotal,
      multiplier: score.totalMultiplier,
      durationSeconds,
      distanceMeters: Math.round(session.distanceMeters),
      finishReason: reason,
    }

    const nextDex = { ...dex }
    for (const card of cards) {
      const existing = nextDex[card.id]
      nextDex[card.id] = existing
        ? {
            ...existing,
            captureCount: existing.captureCount + 1,
            bestScoreWithCard: Math.max(existing.bestScoreWithCard, score.finalScore),
          }
        : {
            cardId: card.id,
            name: card.name,
            prefecture: card.prefecture,
            municipality: card.municipality,
            firstCapturedAt: playedAt,
            captureCount: 1,
            bestScoreWithCard: score.finalScore,
          }
    }

    const nextProfile: Profile = {
      ...profile,
      totalPlays: profile.totalPlays + 1,
      bestScore: Math.max(profile.bestScore, score.finalScore),
    }
    const nextHistory = [record, ...history].slice(0, 100)

    const result: GameResult = {
      id: session.id,
      playedAt,
      cards,
      score,
      durationSeconds,
      distanceMeters: Math.round(session.distanceMeters),
      previousBest,
      isNewBest: score.finalScore > previousBest && cards.length > 0,
      finishReason: reason,
    }

    set({
      phase: 'result',
      session: null,
      result,
      profile: nextProfile,
      dex: nextDex,
      history: nextHistory,
      captureFeedback: null,
    })
    removeKey(STORAGE_KEYS.activeSession)
    saveJson(STORAGE_KEYS.profile, nextProfile)
    saveJson(STORAGE_KEYS.dex, nextDex)
    saveJson(STORAGE_KEYS.history, nextHistory)

    if (cards.length > 0) {
      void submitScore({
        entryId: record.id,
        userName: nextProfile.userName,
        score: record.score,
        bestHandName: record.bestHandName,
        playedAt: record.playedAt,
      })
    }
  },

  abortGame: () => {
    const session = get().session
    if (!session) return
    if (session.captured.length === 0) {
      set({ phase: 'idle', session: null })
      removeKey(STORAGE_KEYS.activeSession)
      return
    }
    get().finishGame('aborted')
  },

  dismissResult: () => set({ phase: 'idle', result: null }),

  clearCaptureFeedback: () => set({ captureFeedback: null }),

  resetAllData: () => {
    clearAll()
    const profile = createProfile()
    set({
      profile,
      dex: {},
      history: [],
      session: null,
      result: null,
      phase: 'idle',
      captureFeedback: null,
    })
    saveJson(STORAGE_KEYS.profile, profile)
  },

  devSetRemainingSeconds: (seconds) => {
    const session = get().session
    if (!session) return
    updateSession(set, get, { endsAt: Date.now() + seconds * 1000 })
  },
}))

/* ---------------- 補助 ---------------- */

type SetState = (partial: Partial<GameState>) => void

function updateSession(set: SetState, get: () => GameState, patch: Partial<ActiveSession>): void {
  const session = get().session
  if (!session) return
  const next = { ...session, ...patch }
  set({ session: next })
  saveJson(STORAGE_KEYS.activeSession, next)
}

function isPlainObject(value: unknown): value is Record<string, DexEntry> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeProfile(stored: Partial<Profile> | null): Profile {
  const base = createProfile()
  if (!stored || typeof stored !== 'object') return base
  return {
    userId: typeof stored.userId === 'string' && stored.userId ? stored.userId : base.userId,
    userName:
      typeof stored.userName === 'string' && stored.userName.trim()
        ? stored.userName.trim().slice(0, 12)
        : base.userName,
    totalPlays: Number.isFinite(stored.totalPlays) ? Number(stored.totalPlays) : 0,
    bestScore: Number.isFinite(stored.bestScore) ? Number(stored.bestScore) : 0,
    createdAt: Number.isFinite(stored.createdAt) ? Number(stored.createdAt) : base.createdAt,
  }
}

function isValidSession(session: unknown): session is ActiveSession {
  if (typeof session !== 'object' || session === null) return false
  const value = session as Partial<ActiveSession>
  return (
    typeof value.id === 'string' &&
    Number.isFinite(value.startedAt) &&
    Number.isFinite(value.endsAt) &&
    Array.isArray(value.captured)
  )
}

/* ---------------- 派生値（テストや画面から使う） ---------------- */

/** 現在の手札 */
export function selectHand(state: GameState): PlaceCard[] {
  return cardsOf(state.session?.captured.map((entry) => entry.cardId) ?? [])
}

/** 暫定スコア */
export function selectInterimScore(state: GameState): ScoreBreakdown {
  return calculateScore(selectHand(state))
}

/** 役予告 */
export function selectHints(state: GameState): HandHint[] {
  return buildHandHints(selectHand(state))
}

/** 残り時間（秒）。ゲーム中でなければ null。 */
export function selectRemainingSeconds(state: GameState): number | null {
  if (!state.session) return null
  return Math.max(0, Math.ceil((state.session.endsAt - state.now) / 1000))
}

/** 現在地から見た、近い順の候補カード */
export function selectNearbyCards(state: GameState, center: LatLng | null): NearbyCard[] {
  const capturedIds = new Set(state.session?.captured.map((entry) => entry.cardId) ?? [])
  return nearbyCards(center, capturedIds)
}
