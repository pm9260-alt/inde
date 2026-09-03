/** 地点データからカードを作り、ID で引けるようにしたもの */
import { buildCards } from '@/domain/cardBuilder'
import { PLACE_SOURCES } from '@/data/stations'
import type { PlaceCard } from '@/domain/types'

export const ALL_CARDS: readonly PlaceCard[] = buildCards(PLACE_SOURCES)

const CARD_BY_ID = new Map(ALL_CARDS.map((card) => [card.id, card]))

export function findCard(cardId: string): PlaceCard | undefined {
  return CARD_BY_ID.get(cardId)
}
