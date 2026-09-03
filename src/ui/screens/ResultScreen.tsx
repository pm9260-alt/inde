/**
 * 結果画面。
 * 「この 5 枚でこの役が完成した」ことが一目で分かることを最優先にしている。
 */
import { formatMultiplier, formatScore } from '@/domain/scoring'
import { formatDistance } from '@/domain/geo'
import type { GameResult } from '@/state/types'
import { primaryAttributeLabel } from '@/ui/format'
import { formatDuration } from '@/ui/format'

interface Props {
  result: GameResult
  rank: number | null
  rankNotice: string
  onClose: () => void
}

export function ResultScreen({ result, rank, rankNotice, onClose }: Props) {
  const { score, cards } = result
  const diff = result.score.finalScore - result.previousBest
  const usedCardIds = new Set(score.bestHand?.cardIds ?? [])

  return (
    <div className="screen screen--scroll result">
      <div className="result__head">
        <p className="result__reason">
          {result.finishReason === 'complete'
            ? '5 枚そろいました'
            : result.finishReason === 'timeup'
              ? '時間切れです'
              : 'チャレンジを終了しました'}
        </p>
        <h1 className="result__hand">{score.bestHand ? score.bestHand.name : '役なし'}</h1>
        {score.bestHand && <p className="result__handdetail">{score.bestHand.detail}</p>}
      </div>

      <div className="result__cards">
        {cards.length === 0 ? (
          <p className="empty">カードを 1 枚も取得できませんでした</p>
        ) : (
          cards.map((card) => (
            <div
              className={`rcard${usedCardIds.has(card.id) ? ' rcard--used' : ''}`}
              key={card.id}
            >
              <div className="rcard__attr">{primaryAttributeLabel(card) || '—'}</div>
              <div className="rcard__name">{card.name}</div>
              <div className="rcard__ward">{card.municipality}</div>
            </div>
          ))
        )}
      </div>

      <div className="result__score">
        <div className="metarow">
          <span className="metarow__key">カード基礎点</span>
          <span className="metarow__value num">{formatScore(score.cardTotal)}</span>
        </div>
        <div className="metarow">
          <span className="metarow__key">倍率</span>
          <span className="metarow__value num">{formatMultiplier(score.totalMultiplier)}</span>
        </div>
        <div className="metarow result__final">
          <span className="metarow__key">最終スコア</span>
          <span className="metarow__value num">{formatScore(score.finalScore)}</span>
        </div>
      </div>

      {score.hands.length > 0 && (
        <div className="section">
          <p className="section__label">成立した役</p>
          {score.hands.map((hand, index) => (
            <div className="metarow" key={hand.id}>
              <span className="metarow__key">
                {hand.name}
                {index === 0 ? '（最大役）' : ''}
              </span>
              <span className="metarow__value num">{formatMultiplier(hand.multiplier)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="section">
        <p className="section__label">記録</p>
        <div className="metarow">
          <span className="metarow__key">移動距離</span>
          <span className="metarow__value num">{formatDistance(result.distanceMeters)}</span>
        </div>
        <div className="metarow">
          <span className="metarow__key">プレイ時間</span>
          <span className="metarow__value num">{formatDuration(result.durationSeconds)}</span>
        </div>
        <div className="metarow">
          <span className="metarow__key">自己ベストとの差</span>
          <span className="metarow__value num">
            {result.isNewBest
              ? '自己ベスト更新'
              : result.previousBest === 0
                ? '—'
                : `${diff >= 0 ? '+' : ''}${formatScore(diff)}`}
          </span>
        </div>
        <div className="metarow">
          <span className="metarow__key">ランキング順位</span>
          <span className="metarow__value num">{rank !== null ? `${rank} 位` : '集計中'}</span>
        </div>
        {rankNotice && <p className="result__notice">{rankNotice}</p>}
      </div>

      <div className="section">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          マップへ戻る
        </button>
      </div>
    </div>
  )
}
