/** カード詳細（マーカーをタップしたときのボトムシート） */
import { captureBlockMessage, type CaptureEligibility } from '@/domain/capture'
import { formatDistance } from '@/domain/geo'
import type { PlaceCard } from '@/domain/types'
import { attributeLabels } from '@/ui/format'
import type { DexEntry } from '@/state/types'

interface Props {
  card: PlaceCard
  distance: number | null
  captured: boolean
  eligibility: CaptureEligibility
  dexEntry: DexEntry | undefined
  onCapture: () => void
  onClose: () => void
  /** デモ版だけ: この地点まで歩く。通常のビルドでは渡さない。 */
  onWalk?: (() => void) | undefined
  walking?: boolean
}

export function CardSheet({
  card,
  distance,
  captured,
  eligibility,
  dexEntry,
  onCapture,
  onClose,
  onWalk,
  walking = false,
}: Props) {
  const attributes = attributeLabels(card)
  const blockMessage = captureBlockMessage(eligibility.reason, eligibility.metersToGo)

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`${card.name} の詳細`}>
        <div className="sheet__grip" />
        <h2 className="sheet__title">{card.name}</h2>
        <div className="sheet__attrs">
          {attributes.length > 0 ? (
            attributes.map((label) => (
              <span className="chip" key={label}>
                {label}
              </span>
            ))
          ) : (
            <span className="chip">属性なし</span>
          )}
        </div>

        <div className="sheet__meta">
          <div className="metarow">
            <span className="metarow__key">所在地</span>
            <span className="metarow__value">
              {card.prefecture} {card.municipality}
            </span>
          </div>
          <div className="metarow">
            <span className="metarow__key">状態</span>
            <span className="metarow__value">
              {captured ? 'このゲームで取得済み' : dexEntry ? '図鑑に登録済み' : '未取得'}
            </span>
          </div>
          <div className="metarow">
            <span className="metarow__key">現在地から</span>
            <span className="metarow__value num">
              {distance === null ? '—' : formatDistance(distance)}
            </span>
          </div>
          <div className="metarow">
            <span className="metarow__key">基礎点</span>
            <span className="metarow__value num">{card.basePoints}</span>
          </div>
        </div>

        <div className="sheet__action">
          {onWalk && !eligibility.canCapture && !captured ? (
            <button type="button" className="btn btn--primary" disabled={walking} onClick={onWalk}>
              {walking ? '歩いています' : 'ここまで歩く'}
            </button>
          ) : (
            <button
              type="button"
              className={eligibility.canCapture ? 'btn btn--ok' : 'btn btn--primary'}
              disabled={!eligibility.canCapture}
              onClick={onCapture}
            >
              取得する
            </button>
          )}
          {!eligibility.canCapture && blockMessage && (
            <p className="sheet__hint">{blockMessage}</p>
          )}
        </div>
      </div>
    </>
  )
}
