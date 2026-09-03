/**
 * 盤面のバランス測定。
 *
 * 実際に歩く前に、机上で分かることだけを数字にする。
 *   ・その場所でどんな役が狙えるか
 *   ・5 枚そろえるのに最低どれだけ歩くか（直線距離 × 道のり係数）
 *
 * 歩く速度や信号待ちは含まないので、30 分で回れるかの最終判断は
 * 実地テストで確かめること。
 *
 * 実行: npm run report:balance
 */
import { GAME_RULES, LOCATION_RULES } from '@/config/gameConfig'
import { analyzeBoard, buildDeck } from '@/domain/board'
import { distanceMeters, type LatLng } from '@/domain/geo'
import { evaluateHands } from '@/domain/hands'
import type { HandId, PlaceCard } from '@/domain/types'
import { ALL_CARDS } from '@/state/cards'

/** 直線距離を実際の道のりに近づけるための係数（都市部の目安） */
export const DETOUR_FACTOR = 1.3

export interface SpotReport {
  name: string
  candidateCount: number
  /** 盤面ごとに狙える役の組み合わせが何種類あったか */
  handPatternCount: number
  /** 出現した役と、その出現率 */
  handRates: Array<{ handId: HandId; rate: number }>
  /** 近い順に 5 枚取ったときの道のり (m) の中央値 */
  medianRouteMeters: number
  /** 近い順に 5 枚取ったときの平均倍率 */
  averageMultiplier: number
}

export function nearbyCandidates(center: LatLng): PlaceCard[] {
  return [...ALL_CARDS]
    .map((card) => ({ card, distance: distanceMeters(center, { lat: card.lat, lng: card.lng }) }))
    .filter((entry) => entry.distance <= LOCATION_RULES.nearbyRadiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, LOCATION_RULES.maxNearbyMarkers)
    .map((entry) => entry.card)
}

/** 現在地から順に近いものを回ったときの道のり */
export function greedyRouteMeters(start: LatLng, cards: readonly PlaceCard[]): number {
  let current = start
  const remaining = [...cards]
  let total = 0
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    for (let i = 0; i < remaining.length; i += 1) {
      const card = remaining[i]!
      const d = distanceMeters(current, { lat: card.lat, lng: card.lng })
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }
    const next = remaining.splice(bestIndex, 1)[0]!
    total += bestDistance
    current = { lat: next.lat, lng: next.lng }
  }
  return total * DETOUR_FACTOR
}

function nearestFive(start: LatLng, deck: readonly PlaceCard[]) {
  const sorted = [...deck].sort(
    (a, b) =>
      distanceMeters(start, { lat: a.lat, lng: a.lng }) -
      distanceMeters(start, { lat: b.lat, lng: b.lng }),
  )
  const hand = sorted.slice(0, GAME_RULES.handSize)
  return { hand, meters: greedyRouteMeters(start, hand) }
}

export function reportSpot(name: string, center: LatLng, rounds = 40): SpotReport {
  const candidates = nearbyCandidates(center)
  const patterns = new Set<string>()
  const handCounts = new Map<HandId, number>()
  const routes: number[] = []
  const multipliers: number[] = []

  for (let seed = 1; seed <= rounds; seed += 1) {
    const deck = buildDeck(candidates, seed)
    const chances = analyzeBoard(deck)
    patterns.add(
      chances
        .map((chance) => chance.handId)
        .sort()
        .join(','),
    )
    for (const chance of chances) {
      handCounts.set(chance.handId, (handCounts.get(chance.handId) ?? 0) + 1)
    }
    const { hand, meters } = nearestFive(center, deck)
    routes.push(meters)
    multipliers.push(evaluateHands(hand)[0]?.multiplier ?? 1)
  }

  routes.sort((a, b) => a - b)
  return {
    name,
    candidateCount: candidates.length,
    handPatternCount: patterns.size,
    handRates: [...handCounts.entries()]
      .map(([handId, count]) => ({ handId, rate: count / rounds }))
      .sort((a, b) => b.rate - a.rate),
    medianRouteMeters: Math.round(routes[Math.floor(routes.length / 2)] ?? 0),
    averageMultiplier:
      Math.round((multipliers.reduce((sum, value) => sum + value, 0) / rounds) * 100) / 100,
  }
}

/** 実地テストの出発地点にしやすい場所 */
export const REPORT_SPOTS: Array<{ name: string; center: LatLng }> = [
  { name: '東京', center: { lat: 35.6812, lng: 139.7671 } },
  { name: '新宿', center: { lat: 35.6896, lng: 139.7006 } },
  { name: '渋谷', center: { lat: 35.658, lng: 139.7016 } },
  { name: '下北沢', center: { lat: 35.6614, lng: 139.668 } },
  { name: '池袋', center: { lat: 35.7295, lng: 139.7109 } },
  { name: '上野', center: { lat: 35.7141, lng: 139.7774 } },
]
