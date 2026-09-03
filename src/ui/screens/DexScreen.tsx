/** カード図鑑。取得済み・未取得・総取得数を確認できる。 */
import { useState } from 'react'
import { formatScore } from '@/domain/scoring'
import { ALL_CARDS } from '@/state/cards'
import { useGameStore } from '@/state/gameStore'
import { attributeLabels, formatDate, primaryAttributeLabel } from '@/ui/format'

export function DexScreen() {
  const dex = useGameStore((state) => state.dex)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const collected = Object.keys(dex).length
  const selected = ALL_CARDS.find((card) => card.id === selectedId) ?? null
  const selectedEntry = selectedId ? dex[selectedId] : undefined

  return (
    <div className="screen screen--scroll">
      <div className="page-head">
        <h1 className="page-head__title">図鑑</h1>
        <p className="page-head__sub num">
          {collected} / {ALL_CARDS.length} 種類を取得
        </p>
      </div>

      <div className="dexgrid">
        {ALL_CARDS.map((card) => {
          const entry = dex[card.id]
          return (
            <button
              type="button"
              key={card.id}
              className={`dexcell${entry ? '' : ' dexcell--locked'}`}
              onClick={() => setSelectedId(card.id)}
            >
              <span className="dexcell__attr">{primaryAttributeLabel(card) || '—'}</span>
              <span className="dexcell__name">{card.name}</span>
              <span className="dexcell__ward">{card.municipality}</span>
            </button>
          )
        })}
      </div>

      {selected && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelectedId(null)} />
          <div className="sheet" role="dialog" aria-label={`${selected.name} の図鑑`}>
            <div className="sheet__grip" />
            <h2 className="sheet__title">{selected.name}</h2>
            <div className="sheet__attrs">
              {attributeLabels(selected).map((label) => (
                <span className="chip" key={label}>
                  {label}
                </span>
              ))}
            </div>
            <div className="sheet__meta">
              <div className="metarow">
                <span className="metarow__key">所在地</span>
                <span className="metarow__value">
                  {selected.prefecture} {selected.municipality}
                </span>
              </div>
              <div className="metarow">
                <span className="metarow__key">初取得日</span>
                <span className="metarow__value num">
                  {selectedEntry ? formatDate(selectedEntry.firstCapturedAt) : '未取得'}
                </span>
              </div>
              <div className="metarow">
                <span className="metarow__key">取得回数</span>
                <span className="metarow__value num">
                  {selectedEntry ? `${selectedEntry.captureCount} 回` : '0 回'}
                </span>
              </div>
              <div className="metarow">
                <span className="metarow__key">このカードでの最高得点</span>
                <span className="metarow__value num">
                  {selectedEntry ? formatScore(selectedEntry.bestScoreWithCard) : '—'}
                </span>
              </div>
            </div>
            <div className="sheet__action">
              <button
                type="button"
                className="btn btn--quiet btn--block"
                onClick={() => setSelectedId(null)}
              >
                閉じる
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
