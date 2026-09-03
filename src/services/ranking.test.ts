import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRanking,
  periodStart,
  submitScore,
  _rankingInternals,
} from '@/services/ranking'

const { toFirestoreFields, fromFirestoreFields } = _rankingInternals

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('期間の区切り', () => {
  it('全期間は 0', () => {
    expect(periodStart('all')).toBe(0)
  })

  it('今日は今より前で、24 時間以内', () => {
    const now = Date.parse('2026-09-04T04:36:00+09:00')
    const start = periodStart('today', now)
    expect(start).toBeLessThanOrEqual(now)
    expect(now - start).toBeLessThan(24 * 60 * 60 * 1000)
  })

  it('今週は今日以前で、7 日以内', () => {
    const now = Date.parse('2026-09-04T04:36:00+09:00')
    expect(periodStart('week', now)).toBeLessThanOrEqual(periodStart('today', now))
    expect(now - periodStart('week', now)).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })
})

describe('Firestore の形式変換', () => {
  const entry = {
    id: 'game-1',
    userName: 'たろう',
    score: 9200,
    bestHandName: '東西南北',
    playedAt: 1_756_900_000_000,
  }

  it('往復して同じ値になる', () => {
    const fields = toFirestoreFields(entry)
    expect(fromFirestoreFields(fields as Record<string, unknown>)).toEqual(entry)
  })

  it('壊れたドキュメントは無視する', () => {
    expect(fromFirestoreFields(undefined)).toBeNull()
    expect(fromFirestoreFields({})).toBeNull()
    expect(fromFirestoreFields({ entryId: { stringValue: 'x' } })).toBeNull()
  })
})

describe('スコアの記録と取得', () => {
  it('共有ランキング未設定でも端末内に残る', async () => {
    const result = await submitScore({
      entryId: 'game-local-1',
      userName: 'わたし',
      score: 5000,
      bestHandName: 'ペア',
      playedAt: Date.now(),
    })
    expect(result.shared).toBe(false)

    const ranking = await fetchRanking('all', ['game-local-1'], 'わたし')
    expect(ranking.entries.map((e) => e.id)).toContain('game-local-1')
    expect(ranking.selfRank).toBe(1)
    expect(ranking.notice?.main).toBeTruthy()
  })

  it('高得点の順に並び、自分の記録が分かる', async () => {
    const now = Date.now()
    await submitScore({ entryId: 'a', userName: 'A', score: 1000, bestHandName: '', playedAt: now })
    await submitScore({ entryId: 'b', userName: 'B', score: 8000, bestHandName: '', playedAt: now })
    await submitScore({ entryId: 'c', userName: 'C', score: 4000, bestHandName: '', playedAt: now })

    const ranking = await fetchRanking('all', ['c'], 'C')
    expect(ranking.entries.map((e) => e.id)).toEqual(['b', 'c', 'a'])
    expect(ranking.selfRank).toBe(2)
    expect(ranking.entries[1]!.isSelf).toBe(true)
  })

  it('通信に失敗してもエラーにせず、端末内の記録を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )
    await submitScore({
      entryId: 'offline-1',
      userName: 'わたし',
      score: 700,
      bestHandName: '',
      playedAt: Date.now(),
    })
    const ranking = await fetchRanking('all', ['offline-1'], 'わたし')
    expect(ranking.entries.map((e) => e.id)).toContain('offline-1')
    expect(ranking.shared).toBe(false)
  })
})
