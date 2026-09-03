import { useEffect } from 'react'
import type { PlaceCard } from '@/domain/types'
import { captureFeedback } from '@/services/haptics'
import { primaryAttributeLabel } from '@/ui/format'

interface Props {
  card: PlaceCard
  onDone: () => void
}

export function CaptureOverlay({ card, onDone }: Props) {
  useEffect(() => {
    captureFeedback()
    const timer = setTimeout(onDone, 950)
    return () => clearTimeout(timer)
  }, [card.id, onDone])

  return (
    <div className="capture" role="status" aria-live="polite">
      <div className="capture__card">
        <div className="capture__name">{card.name}</div>
        <div className="capture__attr">{primaryAttributeLabel(card) || '属性なし'}</div>
        <div className="capture__ward">{card.municipality}</div>
      </div>
    </div>
  )
}
