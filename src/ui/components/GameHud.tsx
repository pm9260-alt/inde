import { GAME_RULES } from '@/config/gameConfig'
import { formatScore } from '@/domain/scoring'
import type { HandHint, ScoreBreakdown } from '@/domain/types'
import { formatClock } from '@/ui/format'

interface Props {
  remainingSeconds: number
  capturedCount: number
  score: ScoreBreakdown
  hints: HandHint[]
  onOpenHands: () => void
}

export function GameHud({ remainingSeconds, capturedCount, score, hints, onOpenHands }: Props) {
  const urgent = remainingSeconds <= 300

  return (
    <div className="hud">
      <div className="hud__row">
        <div className="hud__block">
          <span className="hud__label">残り</span>
          <span className={`hud__value num${urgent ? ' hud__value--urgent' : ''}`}>
            {formatClock(remainingSeconds)}
          </span>
        </div>
        <div className="hud__block">
          <span className="hud__label">カード</span>
          <span className="hud__value num">
            {capturedCount} / {GAME_RULES.handSize}
          </span>
        </div>
        <div className="hud__block hud__score">
          <span className="hud__label">暫定</span>
          <span className="hud__value num">{formatScore(score.finalScore)}</span>
        </div>
      </div>

      <div className="hud__bottom">
        <div className="hud__hints">
          {hints.length > 0 ? (
            hints.map((hint) => (
              <span
                key={`${hint.handId}-${hint.text}`}
                className={`hint${hint.remaining === 1 ? ' hint--close' : ''}`}
              >
                {hint.text}
              </span>
            ))
          ) : (
            <span className="hint hint--quiet">1 枚取ると狙える役が出ます</span>
          )}
        </div>
        <button type="button" className="hud__hands" onClick={onOpenHands}>
          役
        </button>
      </div>
    </div>
  )
}
