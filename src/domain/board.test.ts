import { describe, expect, it } from 'vitest'
import { analyzeBoard, buildDeck, DECK_RULES, seededRandom } from '@/domain/board'
import { buildCard } from '@/domain/cardBuilder'
import { ALL_CARDS } from '@/state/cards'
import { distanceMeters } from '@/domain/geo'

let counter = 0
const card = (name: string, municipality = '千代田区') =>
  buildCard({
    id: `b${(counter += 1)}-${name}`,
    name,
    prefecture: '東京都',
    municipality,
    lat: 35.6,
    lng: 139.7,
  })

/** 東京駅から近い順の候補 */
function candidatesAroundTokyo(limit = 60) {
  const center = { lat: 35.6896, lng: 139.7006 }
  return [...ALL_CARDS]
    .map((c) => ({ c, d: distanceMeters(center, { lat: c.lat, lng: c.lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((entry) => entry.c)
}

describe('乱数', () => {
  it('同じ種なら同じ並びになる', () => {
    const a = Array.from({ length: 5 }, seededRandom(42))
    const b = Array.from({ length: 5 }, seededRandom(42))
    expect(a).toEqual(b)
  })

  it('違う種なら違う並びになる', () => {
    const a = Array.from({ length: 5 }, seededRandom(1))
    const b = Array.from({ length: 5 }, seededRandom(2))
    expect(a).not.toEqual(b)
  })
})

describe('盤面の分析', () => {
  it('東西南北がそろっていれば知らせる', () => {
    const board = [card('東京'), card('西荻窪'), card('南砂町'), card('北品川'), card('上野')]
    expect(analyzeBoard(board).map((c) => c.handId)).toContain('compass')
  })

  it('方角が欠けていれば出さない', () => {
    const board = [card('東京'), card('西荻窪'), card('南砂町'), card('上野')]
    expect(analyzeBoard(board).map((c) => c.handId)).not.toContain('compass')
  })

  it('連続する数字がそろっていれば知らせる', () => {
    const board = [card('一之江'), card('二重橋前'), card('三軒茶屋'), card('四ツ谷'), card('五反田')]
    const straight = analyzeBoard(board).find((c) => c.handId === 'numberStraight')
    expect(straight).toBeDefined()
    expect(straight!.note).toContain('一')
  })

  it('同じ区に 5 駅あれば同一区を知らせる', () => {
    const board = ['東京', '大手町', '日比谷', '神田', '秋葉原'].map((n) => card(n, '千代田区'))
    const same = analyzeBoard(board).find((c) => c.handId === 'sameMunicipality')
    expect(same?.note).toContain('千代田区')
  })

  it('山 3 駅と川 2 駅が別々にあれば山川を知らせる', () => {
    const board = [card('青山一丁目'), card('大岡山'), card('白山'), card('品川'), card('小川町')]
    expect(analyzeBoard(board).map((c) => c.handId)).toContain('mountainRiver')
  })

  it('倍率の高い順に並ぶ', () => {
    const chances = analyzeBoard(candidatesAroundTokyo())
    for (let i = 1; i < chances.length; i += 1) {
      expect(chances[i - 1]!.multiplier).toBeGreaterThanOrEqual(chances[i]!.multiplier)
    }
  })

  it('手がかりは 1 行で返る', () => {
    for (const chance of analyzeBoard(candidatesAroundTokyo())) {
      expect(chance.note).not.toContain('\n')
      expect(chance.note.length).toBeGreaterThan(0)
    }
  })
})

describe('盤面の抽選', () => {
  const candidates = candidatesAroundTokyo()

  it('決まった枚数を選ぶ', () => {
    expect(buildDeck(candidates, 1)).toHaveLength(DECK_RULES.size)
  })

  it('同じカードを重複させない', () => {
    const ids = buildDeck(candidates, 7).map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('いちばん近い駅は必ず入る（開始直後に動けるように）', () => {
    const deck = buildDeck(candidates, 3)
    for (const near of candidates.slice(0, DECK_RULES.alwaysNearest)) {
      expect(deck.map((c) => c.id)).toContain(near.id)
    }
  })

  it('同じ種なら同じ盤面になる', () => {
    expect(buildDeck(candidates, 99).map((c) => c.id)).toEqual(
      buildDeck(candidates, 99).map((c) => c.id),
    )
  })

  it('種が変われば顔ぶれが変わる', () => {
    const a = new Set(buildDeck(candidates, 1).map((c) => c.id))
    const b = new Set(buildDeck(candidates, 2).map((c) => c.id))
    const shared = [...a].filter((id) => b.has(id)).length
    expect(shared).toBeLessThan(DECK_RULES.size)
  })

  it('候補が少ないときはそのまま使う', () => {
    const few = candidates.slice(0, 8)
    expect(buildDeck(few, 5)).toHaveLength(8)
  })

  it('どの盤面でも狙える役が残る', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      expect(analyzeBoard(buildDeck(candidates, seed)).length, `seed ${seed}`).toBeGreaterThan(0)
    }
  })

  it('盤面ごとに狙える役の顔ぶれが変わる', () => {
    const patterns = new Set<string>()
    for (let seed = 1; seed <= 40; seed += 1) {
      patterns.add(
        analyzeBoard(buildDeck(candidates, seed))
          .map((c) => c.handId)
          .sort()
          .join(','),
      )
    }
    expect(patterns.size).toBeGreaterThan(3)
  })
})
