/** 状態から表示用の値を組み立てる、副作用のない関数 */
import { LOCATION_RULES } from '@/config/gameConfig'
import { distanceMeters, type LatLng } from '@/domain/geo'
import type { PlaceCard } from '@/domain/types'
import { ALL_CARDS, findCard } from '@/state/cards'

export interface NearbyCard {
  card: PlaceCard
  distance: number | null
  captured: boolean
}

/** カード ID の配列から、実在するカードだけを取り出す */
export function cardsOf(cardIds: readonly string[]): PlaceCard[] {
  return cardIds
    .map((cardId) => findCard(cardId))
    .filter((card): card is PlaceCard => card !== undefined)
}

/** 現在地から近い順の候補カード。現在地が無いときは先頭から一定件数。 */
export function nearbyCards(center: LatLng | null, capturedIds: ReadonlySet<string>): NearbyCard[] {
  if (!center) {
    return ALL_CARDS.slice(0, LOCATION_RULES.maxNearbyMarkers).map((card) => ({
      card,
      distance: null,
      captured: capturedIds.has(card.id),
    }))
  }
  return ALL_CARDS.map((card) => ({
    card,
    distance: distanceMeters(center, { lat: card.lat, lng: card.lng }),
    captured: capturedIds.has(card.id),
  }))
    .filter((entry) => entry.distance <= LOCATION_RULES.nearbyRadiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, LOCATION_RULES.maxNearbyMarkers)
}
