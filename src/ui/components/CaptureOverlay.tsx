/**
 * カード取得の演出。
 *
 * ・駅名がまず出る
 * ・属性が一拍おいて現れる
 * ・役が成立した瞬間だけ、一段強くする（このゲームの快感の中心）
 */
import { useEffect } from 'react'
import { tapFeedback } from '@/services/haptics'
import type { CaptureFeedback } from '@/state/gameStore'
import { primaryAttributeLabel } from '@/ui/format'

interface Props {
  feedback: CaptureFeedback
  onDone: () => void
}

/** 役が成立したときは少し長く見せる */
const PLAIN_DURATION_MS = 1_050
const HAND_DURATION_MS = 1_900

export function CaptureOverlay({ feedback, onDone }: Props) {
  const { card, completedHand, nextHint } = feedback

  useEffect(() => {
    if (completedHand) {
      // 取得 → 少し置いて役成立、の二段で伝える
      tapFeedback(14)
      const second = setTimeout(() => tapFeedback([24, 60, 40]), 420)
      const finish = setTimeout(onDone, HAND_DURATION_MS)
      return () => {
        clearTimeout(second)
        clearTimeout(finish)
      }
    }
    tapFeedback(14)
    const finish = setTimeout(onDone, PLAIN_DURATION_MS)
    return () => clearTimeout(finish)
  }, [card.id, completedHand, onDone])

  return (
    <div className={`capture${completedHand ? ' capture--hand' : ''}`} role="status" aria-live="polite">
      <div className="capture__card">
        <div className="capture__name">{card.name}</div>
        <div className="capture__attr">{primaryAttributeLabel(card) || '属性なし'}</div>
        <div className="capture__ward">{card.municipality}</div>

        {completedHand ? (
          <div className="capture__hand">
            <span className="capture__handname">{completedHand.name}</span>
            <span className="capture__handmult num">×{completedHand.multiplier.toFixed(1)}</span>
          </div>
        ) : nextHint ? (
          <div className="capture__next">{nextHint}</div>
        ) : null}
      </div>
    </div>
  )
}
