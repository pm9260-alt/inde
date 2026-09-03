/**
 * ランキング。
 *
 * ・記録は必ず端末内に残す（オフラインでも壊れない）
 * ・Firebase の設定があれば Firestore の REST API へも送り、全員で共有する
 * ・共有側が失敗しても端末内の記録で表示を続け、その旨を 1 行で伝える
 *
 * SDK を使わず REST API を直接呼んでいるのは、依存を増やさないため。
 */
import { ENV, hasSharedRanking } from '@/config/env'
import { loadJson, saveJson, STORAGE_KEYS } from '@/services/storage'

export type RankingPeriod = 'today' | 'week' | 'all'

export interface RankingEntry {
  id: string
  userName: string
  score: number
  /** 成立した最大役の名前。役なしのときは空文字。 */
  bestHandName: string
  playedAt: number
  /** プレイしたエリア（区）。古い記録は空文字。 */
  area: string
  /** この端末のプレイヤー本人の記録かどうか */
  isSelf: boolean
}

export interface RankingResult {
  entries: RankingEntry[]
  /** 自分の順位（1 始まり）。圏外なら null */
  selfRank: number | null
  /** 共有ランキングに接続できているか */
  shared: boolean
  /** 表示する注意書き。無ければ null。 */
  notice: RankingNotice | null
}

/** 画面には 1 行目（main）を大きく、2 行目（sub）を小さく出す */
export interface RankingNotice {
  main: string
  sub: string
}

const LOCAL_ONLY_MAIN = 'この端末の記録だけを表示しています'

const FETCH_TIMEOUT_MS = 8_000
const MAX_ENTRIES = 50

/* ---------------- 期間 ---------------- */

/** 期間の開始時刻（日本時間の 0 時を基準にする） */
export function periodStart(period: RankingPeriod, now = Date.now()): number {
  if (period === 'all') return 0
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000
  const jst = new Date(now + JST_OFFSET_MS)
  const startOfJstDayUtc =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - JST_OFFSET_MS
  if (period === 'today') return startOfJstDayUtc
  // 週は月曜始まり
  const weekday = (jst.getUTCDay() + 6) % 7
  return startOfJstDayUtc - weekday * 24 * 60 * 60 * 1000
}

export const PERIOD_LABEL: Record<RankingPeriod, string> = {
  today: '今日',
  week: '今週',
  all: '全期間',
}

/* ---------------- 端末内ランキング ---------------- */

interface StoredEntry {
  id: string
  userName: string
  score: number
  bestHandName: string
  playedAt: number
  /** プレイしたエリア（区）。古い記録には無い。 */
  area?: string
}

function loadLocalEntries(): StoredEntry[] {
  const entries = loadJson<StoredEntry[]>(STORAGE_KEYS.rankingCache, [])
  return Array.isArray(entries) ? entries.filter(isStoredEntry) : []
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.userName === 'string' &&
    typeof entry.score === 'number' &&
    typeof entry.playedAt === 'number'
  )
}

function saveLocalEntry(entry: StoredEntry): void {
  const entries = loadLocalEntries()
  if (!entries.some((existing) => existing.id === entry.id)) entries.push(entry)
  entries.sort((a, b) => b.playedAt - a.playedAt)
  saveJson(STORAGE_KEYS.rankingCache, entries.slice(0, 300))
}

/* ---------------- Firestore REST ---------------- */

function firestoreUrl(path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${ENV.firebaseProjectId}/databases/(default)/documents${path}?key=${ENV.firebaseApiKey}`
}

/** Firestore のドキュメント形式へ変換する */
function toFirestoreFields(entry: StoredEntry): Record<string, unknown> {
  return {
    entryId: { stringValue: entry.id },
    userName: { stringValue: entry.userName },
    score: { integerValue: String(Math.round(entry.score)) },
    bestHandName: { stringValue: entry.bestHandName },
    playedAt: { integerValue: String(entry.playedAt) },
    area: { stringValue: entry.area ?? '' },
  }
}

/** Firestore のドキュメント形式から復元する */
function fromFirestoreFields(fields: Record<string, unknown> | undefined): StoredEntry | null {
  if (!fields) return null
  const read = (key: string): unknown => (fields as Record<string, Record<string, unknown>>)[key]
  const str = (key: string): string => {
    const raw = read(key)
    return typeof raw === 'object' && raw !== null && typeof (raw as { stringValue?: unknown }).stringValue === 'string'
      ? (raw as { stringValue: string }).stringValue
      : ''
  }
  const num = (key: string): number => {
    const raw = read(key) as { integerValue?: string; doubleValue?: number } | undefined
    if (!raw) return NaN
    if (typeof raw.integerValue === 'string') return Number(raw.integerValue)
    if (typeof raw.doubleValue === 'number') return raw.doubleValue
    return NaN
  }
  const id = str('entryId')
  const score = num('score')
  const playedAt = num('playedAt')
  if (!id || !Number.isFinite(score) || !Number.isFinite(playedAt)) return null
  return {
    id,
    userName: str('userName') || 'プレイヤー',
    score,
    bestHandName: str('bestHandName'),
    playedAt,
    area: str('area'),
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function submitShared(entry: StoredEntry): Promise<void> {
  const response = await fetchWithTimeout(firestoreUrl(`/${ENV.firebaseCollection}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(entry) }),
  })
  if (!response.ok) throw new Error(`Firestore への保存に失敗しました (${response.status})`)
}

async function fetchShared(period: RankingPeriod): Promise<StoredEntry[]> {
  const structuredQuery = {
    from: [{ collectionId: ENV.firebaseCollection }],
    orderBy: [{ field: { fieldPath: 'score' }, direction: 'DESCENDING' }],
    limit: MAX_ENTRIES,
    ...(period === 'all'
      ? {}
      : {
          where: {
            fieldFilter: {
              field: { fieldPath: 'playedAt' },
              op: 'GREATER_THAN_OR_EQUAL',
              value: { integerValue: String(periodStart(period)) },
            },
          },
        }),
  }
  const response = await fetchWithTimeout(firestoreUrl(':runQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  })
  if (!response.ok) throw new Error(`ランキングを取得できませんでした (${response.status})`)
  const rows = (await response.json()) as Array<{ document?: { fields?: Record<string, unknown> } }>
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => fromFirestoreFields(row.document?.fields))
    .filter((entry): entry is StoredEntry => entry !== null)
}

/* ---------------- 公開 API ---------------- */

export interface SubmitParams {
  entryId: string
  userName: string
  score: number
  bestHandName: string
  playedAt: number
  area?: string
}

/** スコアを記録する。共有側が失敗しても端末内には必ず残る。 */
export async function submitScore(params: SubmitParams): Promise<{ shared: boolean }> {
  const entry: StoredEntry = {
    id: params.entryId,
    userName: params.userName,
    score: params.score,
    bestHandName: params.bestHandName,
    playedAt: params.playedAt,
    area: params.area ?? '',
  }
  saveLocalEntry(entry)
  if (!hasSharedRanking() || !isOnline()) return { shared: false }
  try {
    await submitShared(entry)
    return { shared: true }
  } catch {
    return { shared: false }
  }
}

export interface FetchRankingOptions {
  /**
   * エリアで絞り込む。区名を渡すとそのエリアだけを対象にする。
   * 駅の密度によって作れる役が変わるため、同じ条件どうしで competing できるようにする。
   */
  area?: string
}

/** ランキングを取得する。共有が使えないときは端末内の記録で組み立てる。 */
export async function fetchRanking(
  period: RankingPeriod,
  selfEntryIds: readonly string[],
  selfUserName: string,
  options: FetchRankingOptions = {},
): Promise<RankingResult> {
  const since = periodStart(period)
  const localEntries = loadLocalEntries().filter((entry) => entry.playedAt >= since)

  let sharedEntries: StoredEntry[] | null = null
  let notice: RankingNotice | null = null

  if (hasSharedRanking()) {
    if (!isOnline()) {
      notice = { main: LOCAL_ONLY_MAIN, sub: 'ネットにつながると全員の記録が出ます' }
    } else {
      try {
        sharedEntries = await fetchShared(period)
      } catch {
        notice = { main: LOCAL_ONLY_MAIN, sub: '全員のランキングを取得できませんでした' }
      }
    }
  } else {
    notice = { main: LOCAL_ONLY_MAIN, sub: '共有ランキングはまだ設定されていません' }
  }

  const merged = new Map<string, StoredEntry>()
  for (const entry of sharedEntries ?? []) merged.set(entry.id, entry)
  for (const entry of localEntries) merged.set(entry.id, entry)

  const selfIdSet = new Set(selfEntryIds)
  const filtered = options.area
    ? Array.from(merged.values()).filter((entry) => entry.area === options.area)
    : Array.from(merged.values())

  const sorted = filtered
    .sort((a, b) => b.score - a.score || a.playedAt - b.playedAt)
    .slice(0, MAX_ENTRIES)
    .map<RankingEntry>((entry) => ({
      id: entry.id,
      userName: entry.userName || selfUserName,
      score: entry.score,
      bestHandName: entry.bestHandName,
      playedAt: entry.playedAt,
      area: entry.area ?? '',
      isSelf: selfIdSet.has(entry.id),
    }))

  const selfIndex = sorted.findIndex((entry) => entry.isSelf)
  return {
    entries: sorted,
    selfRank: selfIndex >= 0 ? selfIndex + 1 : null,
    shared: sharedEntries !== null,
    notice,
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export const _rankingInternals = { toFirestoreFields, fromFirestoreFields, loadLocalEntries }
