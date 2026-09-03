/**
 * カード図鑑。
 *
 * 405 駅を一列に並べると長すぎて探せないため、区ごとにまとめて折りたたむ。
 * 未取得カードの属性は伏せて、取ったときの発見を残す。
 */
import { useMemo, useState } from 'react'
import { formatScore } from '@/domain/scoring'
import { ALL_CARDS } from '@/state/cards'
import { useGameStore } from '@/state/gameStore'
import { attributeLabels, formatDate, primaryAttributeLabel } from '@/ui/format'

export function DexScreen() {
  const dex = useGameStore((state) => state.dex)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openWard, setOpenWard] = useState<string | null>(null)

  const wards = useMemo(() => {
    const grouped = new Map<string, typeof ALL_CARDS>()
    for (const card of ALL_CARDS) {
      const list = grouped.get(card.municipality)
      if (list) (list as (typeof ALL_CARDS)[number][]).push(card)
      else grouped.set(card.municipality, [card])
    }
    return [...grouped.entries()].map(([name, cards]) => ({ name, cards }))
  }, [])

  const collected = Object.keys(dex).length
  const selected = ALL_CARDS.find((card) => card.id === selectedId) ?? null
  const selectedEntry = selectedId ? dex[selectedId] : undefined
  const selectedOwned = selectedEntry !== undefined

  return (
    <div className="screen screen--scroll">
      <div className="page-head">
        <h1 className="page-head__title">図鑑</h1>
        <p className="page-head__sub num">
          {collected} / {ALL_CARDS.length} 種類を取得
        </p>
      </div>

      <div className="wardlist">
        {wards.map((ward) => {
          const owned = ward.cards.filter((card) => dex[card.id]).length
          const open = openWard === ward.name
          return (
            <div className="ward" key={ward.name}>
              <button
                type="button"
                className="ward__head"
                aria-expanded={open}
                onClick={() => setOpenWard(open ? null : ward.name)}
              >
                <span className="ward__name">{ward.name}</span>
                <span className="ward__count num">
                  {owned} / {ward.cards.length}
                </span>
                <span className="ward__mark" aria-hidden="true">
                  {open ? '−' : '＋'}
                </span>
              </button>

              {open && (
                <div className="dexgrid">
                  {ward.cards.map((card) => {
                    const entry = dex[card.id]
                    return (
                      <button
                        type="button"
                        key={card.id}
                        className={`dexcell${entry ? '' : ' dexcell--locked'}`}
                        onClick={() => setSelectedId(card.id)}
                      >
                        <span className="dexcell__attr">
                          {entry ? primaryAttributeLabel(card) || '—' : '？'}
                        </span>
                        <span className="dexcell__name">{card.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
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
              {selectedOwned ? (
                attributeLabels(selected).length > 0 ? (
                  attributeLabels(selected).map((label) => (
                    <span className="chip" key={label}>
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="chip">属性なし</span>
                )
              ) : (
                <span className="chip">取ると属性が分かります</span>
              )}
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
