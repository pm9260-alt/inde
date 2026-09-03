import { describe, expect, it } from 'vitest'
import { GAME_RULES, HAND_DEFINITIONS, SCORING } from '@/config/gameConfig'
import { buildCard } from '@/domain/cardBuilder'
import { calculateScore, formatMultiplier, formatScore } from '@/domain/scoring'

let counter = 0
const card = (name: string, municipality = '世田谷区') =>
  buildCard({
    id: `s${(counter += 1)}-${name}`,
    name,
    prefecture: '東京都',
    municipality,
    lat: 35.6,
    lng: 139.7,
  })

describe('スコア計算', () => {
  it('役なしのときは倍率 1.0', () => {
    // 共通の漢字も属性も持たない 5 枚
    const cards = [
      card('恵比寿', '渋谷区'),
      card('巣鴨', '豊島区'),
      card('神楽坂', '新宿区'),
      card('秋葉原', '千代田区'),
      card('竹芝', '港区'),
    ]
    const score = calculateScore(cards)
    expect(score.hands).toHaveLength(0)
    expect(score.totalMultiplier).toBe(SCORING.noHandMultiplier)
    expect(score.finalScore).toBe(score.cardTotal)
  })

  it('最大役の倍率をそのまま使い、他の役は控えめに足す', () => {
    const cards = [
      card('東京', '千代田区'),
      card('西荻窪', '杉並区'),
      card('南砂町', '江東区'),
      card('北品川', '品川区'),
      card('北千住', '足立区'),
    ]
    const score = calculateScore(cards)
    expect(score.bestHand?.id).toBe('compass')
    expect(score.baseMultiplier).toBe(HAND_DEFINITIONS.compass.multiplier)

    const expectedBonus = score.hands
      .slice(1)
      .reduce((sum, hand) => sum + (hand.multiplier - 1) * SCORING.secondaryHandWeight, 0)
    expect(score.bonusMultiplier).toBeCloseTo(expectedBonus, 5)
    expect(score.totalMultiplier).toBeCloseTo(score.baseMultiplier + expectedBonus, 2)
    expect(score.finalScore).toBe(Math.round(score.cardTotal * score.totalMultiplier))
  })

  it('カード基礎点の合計が正しい', () => {
    const cards = [card('三軒茶屋'), card('四ツ谷', '新宿区')]
    expect(calculateScore(cards).cardTotal).toBe(
      cards.reduce((sum, c) => sum + c.basePoints, 0),
    )
  })

  it('5 枚に満たないときは減点される', () => {
    const four = [card('東京'), card('西荻窪'), card('南砂町'), card('北品川')]
    const score = calculateScore(four)
    expect(four.length).toBeLessThan(GAME_RULES.handSize)
    const withoutPenalty = score.baseMultiplier + score.bonusMultiplier
    expect(score.totalMultiplier).toBeLessThan(withoutPenalty)
    expect(score.totalMultiplier).toBeCloseTo(withoutPenalty * SCORING.incompleteHandPenalty, 2)
  })

  it('手札が空ならスコアは 0', () => {
    const score = calculateScore([])
    expect(score.finalScore).toBe(0)
    expect(score.cardTotal).toBe(0)
  })
})

describe('表示形式', () => {
  it('倍率', () => {
    expect(formatMultiplier(4)).toBe('×4.0')
    expect(formatMultiplier(4.25)).toBe('×4.25')
  })

  it('スコアは 3 桁区切り', () => {
    expect(formatScore(9200)).toBe('9,200')
  })
})
