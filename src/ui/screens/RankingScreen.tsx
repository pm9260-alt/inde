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

export function RankingScreen({ onOpenProfile }: { onOpenProfile: () => void }) {
  const profile = useGameStore((state) => state.profile)
  const history = useGameStore((state) => state.history)
  const deck = useGameStore((state) => state.deck)
  const dex = useGameStore((state) => state.dex)
  // 直前に遊んだエリアを既定にする（盤面は終了後に引き直されるため、履歴を優先する）
  const myArea = history.find((record) => record.area)?.area || deck?.area || ''
  const [period, setPeriod] = useState<RankingPeriod>('today')
  const [areaOnly, setAreaOnly] = useState(true)
  const [result, setResult] = useState<RankingResult | null>(null)
  const [loading, setLoading] = useState(true)

  const selfIds = history.map((record) => record.id)

  const area = areaOnly && myArea ? myArea : undefined

  const load = useCallback(
    async (target: RankingPeriod) => {
      setLoading(true)
      try {
        setResult(await fetchRanking(target, selfIds, profile.userName, area ? { area } : {}))
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
    // history の中身とエリアの切り替えで読み直す
    [history.length, profile.userName, area],
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

      <button type="button" className="mecard" onClick={onOpenProfile}>
        <span className="mecard__name">{profile.userName}</span>
        <span className="mecard__stats num">
          最高 {formatScore(profile.bestScore)} ／ {profile.totalPlays} 回 ／ 図鑑{' '}
          {Object.keys(dex).length}
        </span>
        <span className="mecard__go">設定</span>
      </button>

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

      {myArea && (
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={areaOnly}
            className="segmented__item"
            onClick={() => setAreaOnly(true)}
          >
            {myArea}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!areaOnly}
            className="segmented__item"
            onClick={() => setAreaOnly(false)}
          >
            すべての場所
          </button>
        </div>
      )}

      {areaOnly && myArea && (
        <p className="footnote areanote">
          駅の多さで作れる役が変わるため、同じエリアどうしで比べています
        </p>
      )}

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
              <span className="rankrow__hand">
                {entry.bestHandName || '役なし'}
                {!areaOnly && entry.area ? `・${entry.area}` : ''}
              </span>
              <span className="rankrow__score num">{formatScore(entry.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
