/**
 * スコア計算。
 *
 * 最終スコア = カード基礎点の合計 × 倍率
 *   倍率 = 最大役の倍率 + Σ (その他の役の倍率 - 1) × secondaryHandWeight
 * 手札が 5 枚に満たないまま終わった場合は incompleteHandPenalty を掛ける。
 */
import { GAME_RULES, SCORING } from '@/config/gameConfig'
import { evaluateHands } from '@/domain/hands'
import type { PlaceCard, ScoreBreakdown } from '@/domain/types'

export function calculateScore(cards: readonly PlaceCard[]): ScoreBreakdown {
  const cardTotal = cards.reduce((sum, card) => sum + card.basePoints, 0)
  const hands = evaluateHands(cards)
  const bestHand = hands[0] ?? null

  const baseMultiplier = bestHand ? bestHand.multiplier : SCORING.noHandMultiplier
  const bonusMultiplier = hands
    .slice(1)
    .reduce((sum, hand) => sum + (hand.multiplier - 1) * SCORING.secondaryHandWeight, 0)

  const incomplete = cards.length > 0 && cards.length < GAME_RULES.handSize
  const rawMultiplier = baseMultiplier + bonusMultiplier
  const totalMultiplier = incomplete ? rawMultiplier * SCORING.incompleteHandPenalty : rawMultiplier

  return {
    cardTotal,
    hands,
    bestHand,
    baseMultiplier,
    bonusMultiplier,
    totalMultiplier: round2(totalMultiplier),
    finalScore: Math.round(cardTotal * totalMultiplier),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 「×4.25」のような表示に使う */
export function formatMultiplier(multiplier: number): string {
  return `×${multiplier.toFixed(multiplier % 1 === 0 ? 1 : 2)}`
}

/** 「9,200」のような表示に使う */
export function formatScore(score: number): string {
  return score.toLocaleString('ja-JP')
}
