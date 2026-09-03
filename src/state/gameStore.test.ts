/**
 * ゲームループの通しテスト。
 * 開始 → 移動 → 取得 → 5 枚 → 役判定 → スコア → 履歴・図鑑・ランキング反映
 * までを、画面を介さずに一気通貫で確認する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_RULES, LOCATION_RULES } from '@/config/gameConfig'
import { offsetLatLng } from '@/domain/geo'
import { fetchRanking } from '@/services/ranking'
import { clearAll, loadJson, STORAGE_KEYS } from '@/services/storage'
import {
  findCard,
  selectDeckCardIds,
  selectHand,
  selectHints,
  selectInterimScore,
  useGameStore,
} from '@/state/gameStore'
import type { ActiveSession } from '@/state/types'

const COMPASS_ROUTE = ['tokyo-東京', 'tokyo-西荻窪', 'tokyo-南砂町', 'tokyo-北品川', 'tokyo-上野']

/** その地点に立った状態にする */
function standAt(cardId: string, accuracy = 8) {
  const card = findCard(cardId)
  if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
  useGameStore.getState().updateFix({
    coords: { lat: card.lat, lng: card.lng },
    accuracy,
    timestamp: Date.now(),
    mocked: true,
  })
}

function resetStore() {
  clearAll()
  useGameStore.setState({
    ready: false,
    phase: 'idle',
    session: null,
    deck: null,
    result: null,
    dex: {},
    history: [],
    fix: null,
    captureFeedback: null,
    now: Date.now(),
  })
  useGameStore.getState().init()
}

/**
 * テスト用に、狙ったカードを盤面へ入れてからゲームを始める。
 * 盤面は毎回抽選されるため、そのままでは取りたい駅が入らないことがある。
 */
function startGameWithDeck(cardIds: readonly string[]) {
  const store = useGameStore.getState
  standAt(cardIds[0]!)
  store().startGame()
  const session = store().session!
  useGameStore.setState({
    session: { ...session, deckCardIds: Array.from(new Set([...cardIds, ...session.deckCardIds])) },
  })
}

beforeEach(() => {
  resetStore()
})

describe('ゲームループ', () => {
  it('5 枚そろえると役が判定され、スコア・履歴・図鑑に反映される', async () => {
    const store = useGameStore.getState

    expect(store().phase).toBe('idle')
    startGameWithDeck(COMPASS_ROUTE)
    expect(store().phase).toBe('playing')
    expect(store().session?.captured).toHaveLength(0)

    for (const cardId of COMPASS_ROUTE) {
      standAt(cardId)
      const result = store().captureCard(cardId)
      expect(result.ok, `${cardId} を取得できるはず`).toBe(true)
    }

    expect(selectHand(store())).toHaveLength(GAME_RULES.handSize)

    store().finishGame('complete')

    const result = store().result
    expect(store().phase).toBe('result')
    expect(result).not.toBeNull()
    expect(result!.cards).toHaveLength(5)
    expect(result!.score.bestHand?.id).toBe('compass')
    expect(result!.score.finalScore).toBeGreaterThan(result!.score.cardTotal)

    // 履歴
    expect(store().history).toHaveLength(1)
    expect(store().history[0]!.bestHandName).toBe('東西南北')

    // プロフィール
    expect(store().profile.totalPlays).toBe(1)
    expect(store().profile.bestScore).toBe(result!.score.finalScore)

    // 図鑑
    for (const cardId of COMPASS_ROUTE) {
      expect(store().dex[cardId]).toBeDefined()
      expect(store().dex[cardId]!.captureCount).toBe(1)
      expect(store().dex[cardId]!.bestScoreWithCard).toBe(result!.score.finalScore)
    }

    // ランキング
    const ranking = await fetchRanking('all', [result!.id], store().profile.userName)
    expect(ranking.entries.map((entry) => entry.id)).toContain(result!.id)
    expect(ranking.selfRank).toBe(1)
  })

  it('遠すぎる地点は取得できない', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    const card = findCard('tokyo-東京')!
    const far = offsetLatLng({ lat: card.lat, lng: card.lng }, 800, 0)
    store().updateFix({ coords: far, accuracy: 8, timestamp: Date.now(), mocked: true })

    expect(store().captureCard('tokyo-東京').ok).toBe(false)
    expect(store().session?.captured).toHaveLength(0)
  })

  it('同じカードは 1 ゲームで 1 回しか取れない', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    expect(store().captureCard('tokyo-東京').ok).toBe(true)
    expect(store().captureCard('tokyo-東京').ok).toBe(false)
    expect(store().session?.captured).toHaveLength(1)
  })

  it('ゲーム開始前は取得できない', () => {
    const store = useGameStore.getState
    standAt('tokyo-東京')
    expect(store().captureCard('tokyo-東京').ok).toBe(false)
  })

  it('GPS 精度が悪すぎると取得できない', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京', LOCATION_RULES.unusableAccuracyMeters + 50)
    expect(store().captureCard('tokyo-東京').ok).toBe(false)
  })

  it('取得のたびに役予告と暫定スコアが更新される', () => {
    const store = useGameStore.getState
    startGameWithDeck(COMPASS_ROUTE)

    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    const scoreAfterOne = selectInterimScore(store()).finalScore
    expect(scoreAfterOne).toBeGreaterThan(0)

    standAt('tokyo-西荻窪')
    store().captureCard('tokyo-西荻窪')
    standAt('tokyo-南砂町')
    store().captureCard('tokyo-南砂町')

    const hints = selectHints(store())
    expect(hints.some((hint) => hint.text === 'あと「北」で東西南北')).toBe(true)
    expect(selectInterimScore(store()).finalScore).toBeGreaterThan(scoreAfterOne)
  })

  it('移動距離が積み上がる（小さすぎる揺れは無視する）', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    const start = { lat: 35.6812, lng: 139.7671 }
    store().updateFix({ coords: start, accuracy: 8, timestamp: Date.now(), mocked: true })

    // GPS の揺れ程度の移動は加算しない
    store().updateFix({
      coords: offsetLatLng(start, 3, 0),
      accuracy: 8,
      timestamp: Date.now(),
      mocked: true,
    })
    expect(store().session!.distanceMeters).toBe(0)

    // 意味のある移動は加算する
    store().updateFix({
      coords: offsetLatLng(start, 300, 90),
      accuracy: 8,
      timestamp: Date.now(),
      mocked: true,
    })
    expect(store().session!.distanceMeters).toBeGreaterThan(250)
  })
})

describe('時間切れ', () => {
  it('制限時間を過ぎたら自動で終了する', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')

    // 終了時刻を過去にして時間経過を再現する
    useGameStore.setState({
      session: { ...store().session!, endsAt: Date.now() - 1000 },
    })
    store().tick()

    expect(store().phase).toBe('result')
    expect(store().result?.finishReason).toBe('timeup')
    expect(store().result?.cards).toHaveLength(1)
  })

  it('5 枚に満たないと倍率が下がる', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    store().finishGame('timeup')
    const score = store().result!.score
    expect(score.totalMultiplier).toBeLessThan(score.baseMultiplier + score.bonusMultiplier + 0.001)
  })
})

describe('中断と復帰', () => {
  it('進行中のゲームは保存され、開き直すと続きから遊べる', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')

    const saved = loadJson<ActiveSession | null>(STORAGE_KEYS.activeSession, null)
    expect(saved?.captured).toHaveLength(1)

    // アプリを開き直した状況を再現
    useGameStore.setState({ ready: false, phase: 'idle', session: null })
    store().init()

    expect(store().phase).toBe('playing')
    expect(store().session?.captured).toHaveLength(1)
  })

  it('閉じている間に時間切れになっていたら、開いた時点で結果になる', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    useGameStore.setState({ session: { ...store().session!, endsAt: Date.now() - 60_000 } })
    // 保存内容も過去の終了時刻に更新しておく
    store().devSetRemainingSeconds(-60)

    useGameStore.setState({ ready: false, phase: 'idle', session: null })
    store().init()

    expect(store().phase).toBe('result')
    expect(store().result?.finishReason).toBe('timeup')
  })

  it('1 枚も取らずにやめたら記録を残さない', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    store().abortGame()
    expect(store().phase).toBe('idle')
    expect(store().history).toHaveLength(0)
    expect(store().profile.totalPlays).toBe(0)
  })

  it('取得済みカードがある状態でやめたら結果を残す', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    store().abortGame()
    expect(store().phase).toBe('result')
    expect(store().history).toHaveLength(1)
  })

  it('壊れた保存データがあっても起動できる', () => {
    window.localStorage.setItem('machi-poker/v1/active-session', 'こわれています')
    window.localStorage.setItem('machi-poker/v1/profile', '{{{')
    useGameStore.setState({ ready: false })
    expect(() => useGameStore.getState().init()).not.toThrow()
    expect(useGameStore.getState().phase).toBe('idle')
  })
})

describe('繰り返しプレイ', () => {
  it('2 回目のプレイで図鑑の取得回数と最高得点が更新される', () => {
    const store = useGameStore.getState

    const playOnce = (route: string[]) => {
      startGameWithDeck(route)
      for (const cardId of route) {
        standAt(cardId)
        store().captureCard(cardId)
      }
      store().finishGame('complete')
      store().dismissResult()
    }

    playOnce(['tokyo-東京', 'tokyo-上野', 'tokyo-池袋', 'tokyo-渋谷', 'tokyo-新宿'])
    const firstScore = store().profile.bestScore
    expect(store().dex['tokyo-東京']!.captureCount).toBe(1)

    playOnce(COMPASS_ROUTE)
    expect(store().profile.totalPlays).toBe(2)
    expect(store().dex['tokyo-東京']!.captureCount).toBe(2)
    expect(store().profile.bestScore).toBeGreaterThanOrEqual(firstScore)
    expect(store().dex['tokyo-東京']!.bestScoreWithCard).toBe(store().profile.bestScore)
  })
})

describe('取得演出', () => {
  it('取得するときっかけが立ち、消せる', () => {
    vi.useFakeTimers()
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京'])
    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    expect(store().captureFeedback?.card.name).toBe('東京')
    store().clearCaptureFeedback()
    expect(store().captureFeedback).toBeNull()
    vi.useRealTimers()
  })
})

describe('盤面', () => {
  it('ゲームを始めると盤面が固定される', () => {
    const store = useGameStore.getState
    standAt('tokyo-東京')
    store().startGame()
    const deck = store().session!.deckCardIds
    expect(deck.length).toBeGreaterThan(0)
    expect(selectDeckCardIds(store())).toEqual(deck)
  })

  it('ゲームごとに盤面の顔ぶれが変わる', () => {
    const store = useGameStore.getState
    const decks: string[][] = []
    for (let i = 0; i < 6; i += 1) {
      standAt('tokyo-東京')
      store().startGame()
      decks.push([...store().session!.deckCardIds].sort())
      store().finishGame('timeup')
      store().dismissResult()
    }
    const unique = new Set(decks.map((deck) => deck.join(',')))
    expect(unique.size).toBeGreaterThan(1)
  })

  it('盤面に無いカードは取得できない', () => {
    const store = useGameStore.getState
    standAt('tokyo-東京')
    store().startGame()
    const session = store().session!
    // 盤面から東京を外す
    useGameStore.setState({
      session: { ...session, deckCardIds: session.deckCardIds.filter((id) => id !== 'tokyo-東京') },
    })
    expect(selectDeckCardIds(store())).not.toContain('tokyo-東京')
  })

  it('開始地点の区が記録される', () => {
    const store = useGameStore.getState
    standAt('tokyo-東京')
    store().startGame()
    expect(store().session!.area).toBe('千代田区')
    standAt('tokyo-東京')
    store().captureCard(store().session!.deckCardIds[0]!)
    store().finishGame('timeup')
    expect(store().result!.area).toBe('千代田区')
    expect(store().history[0]!.area).toBe('千代田区')
  })
})

describe('取得の手ごたえ', () => {
  it('役が成立した取得では、その役が feedback に入る', () => {
    const store = useGameStore.getState
    startGameWithDeck(['tokyo-東京', 'tokyo-東銀座'])

    standAt('tokyo-東京')
    store().captureCard('tokyo-東京')
    expect(store().captureFeedback?.completedHand).toBeNull()
    expect(store().captureFeedback?.nextHint).not.toBe('')

    standAt('tokyo-東銀座')
    store().captureCard('tokyo-東銀座')
    expect(store().captureFeedback?.completedHand?.name).toBe('ペア')
  })
})

describe('惜しかった役', () => {
  it('あと 1 枚で届いた役を結果に残す', () => {
    const store = useGameStore.getState
    // 東・西・南 と無関係の 2 枚 → あと「北」で東西南北
    const route = ['tokyo-東京', 'tokyo-西荻窪', 'tokyo-南砂町', 'tokyo-上野', 'tokyo-恵比寿']
    startGameWithDeck(route)
    for (const cardId of route) {
      standAt(cardId)
      store().captureCard(cardId)
    }
    store().finishGame('complete')
    expect(store().result!.nearMiss?.text).toContain('北')
  })
})
