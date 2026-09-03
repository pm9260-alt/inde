/** ランキング。今日・今週・全期間の 3 種類。自分の順位を常に分かるようにする。 */
import { useCallback, useEffect, useState } from 'react'
import { formatScore } from '@/domain/scoring'
import {
  fetchRanking,
  PERIOD_LABEL,
  type RankingPeriod,
  type RankingResult,
} from '@/services/ranking'
import { useGameStore } from '@/state/gameStore'

const PERIODS: RankingPeriod[] = ['today', 'week', 'all']

export function RankingScreen() {
  const profile = useGameStore((state) => state.profile)
  const history = useGameStore((state) => state.history)
  const [period, setPeriod] = useState<RankingPeriod>('today')
  const [result, setResult] = useState<RankingResult | null>(null)
  const [loading, setLoading] = useState(true)

  const selfIds = history.map((record) => record.id)

  const load = useCallback(
    async (target: RankingPeriod) => {
      setLoading(true)
      try {
        setResult(await fetchRanking(target, selfIds, profile.userName))
      } catch {
        setResult({
          entries: [],
          selfRank: null,
          shared: false,
          notice: { main: 'ランキングを取得できませんでした', sub: 'もう一度開くと再試行します' },
        })
      } finally {
        setLoading(false)
      }
    },
    // history の中身が変わったときだけ読み直す
    [history.length, profile.userName],
  )

  useEffect(() => {
    void load(period)
  }, [period, load])

  return (
    <div className="screen screen--scroll">
      <div className="page-head">
        <h1 className="page-head__title">ランキング</h1>
        {result?.selfRank != null && (
          <p className="page-head__sub num">あなたは {result.selfRank} 位</p>
        )}
      </div>

      <div className="segmented" role="tablist">
        {PERIODS.map((value) => (
          <button
            type="button"
            key={value}
            role="tab"
            aria-selected={period === value}
            className="segmented__item"
            onClick={() => setPeriod(value)}
          >
            {PERIOD_LABEL[value]}
          </button>
        ))}
      </div>

      {result?.notice && (
        <div className="notice">
          <span className="notice__text">
            <span className="notice__main">{result.notice.main}</span>
            <span className="notice__sub">{result.notice.sub}</span>
          </span>
        </div>
      )}

      {loading ? (
        <p className="empty">読み込んでいます</p>
      ) : !result || result.entries.length === 0 ? (
        <p className="empty">
          まだ記録がありません
          <br />
          チャレンジを 1 回終えるとここに載ります
        </p>
      ) : (
        <ol className="ranklist">
          {result.entries.map((entry, index) => (
            <li className={`rankrow${entry.isSelf ? ' rankrow--self' : ''}`} key={entry.id}>
              <span className="rankrow__rank num">{index + 1}</span>
              <span className="rankrow__name">{entry.userName}</span>
              <span className="rankrow__hand">{entry.bestHandName || '役なし'}</span>
              <span className="rankrow__score num">{formatScore(entry.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
