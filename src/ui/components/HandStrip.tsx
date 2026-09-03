import { GAME_RULES } from '@/config/gameConfig'
import type { PlaceCard } from '@/domain/types'
import { primaryAttributeLabel } from '@/ui/format'

export function HandStrip({ cards }: { cards: readonly PlaceCard[] }) {
  const slots = Array.from({ length: GAME_RULES.handSize }, (_, index) => cards[index] ?? null)
  return (
    <div className="hand" aria-label="現在の手札">
      {slots.map((card, index) =>
        card ? (
          <div className="handcard" key={card.id}>
            <div className="handcard__name">{card.name}</div>
            <div className="handcard__attr">{primaryAttributeLabel(card) || '—'}</div>
            <div className="handcard__ward">{card.municipality}</div>
          </div>
        ) : (
          <div className="handcard handcard--empty" key={`slot-${index}`}>
            <div className="handcard__slot num">{index + 1}</div>
          </div>
        ),
      )}
    </div>
  )
}
