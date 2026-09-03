import { GAME_RULES } from '@/config/gameConfig'
import { formatScore } from '@/domain/scoring'
import type { HandHint, ScoreBreakdown } from '@/domain/types'
import { formatClock } from '@/ui/format'

interface Props {
  remainingSeconds: number
  capturedCount: number
  score: ScoreBreakdown
  hints: HandHint[]
}

export function GameHud({ remainingSeconds, capturedCount, score, hints }: Props) {
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
      {hints.length > 0 && (
        <div className="hud__hints">
          {hints.map((hint) => (
            <span
              key={`${hint.handId}-${hint.text}`}
              className={`hint${hint.remaining === 1 ? ' hint--close' : ''}`}
            >
              {hint.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
