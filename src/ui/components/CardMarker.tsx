import type { PlaceCard } from '@/domain/types'
import { primaryAttributeLabel } from '@/ui/format'

interface Props {
  card: PlaceCard
  captured: boolean
  inRange: boolean
  selected: boolean
  /** 広い範囲を映しているときは小さく表示して、重なりを減らす */
  compact: boolean
  onSelect: (cardId: string) => void
}

export function CardMarker({ card, captured, inRange, selected, compact, onSelect }: Props) {
  const className = [
    'marker',
    inRange && !captured ? 'marker--near' : '',
    captured ? 'marker--captured' : '',
    selected ? 'marker--selected' : '',
    compact && !selected ? 'marker--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const attribute = primaryAttributeLabel(card)

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(card.id)
      }}
      aria-label={`${card.name}${captured ? '（取得済み）' : ''}`}
    >
      <span className="marker__pill">
        <span className="marker__name">{card.name}</span>
        {captured ? (
          <span className="marker__done">済</span>
        ) : attribute && !compact ? (
          <span className="marker__attr">{attribute}</span>
        ) : null}
      </span>
      <span className="marker__stem" />
      <span className="marker__dot" />
    </button>
  )
}
