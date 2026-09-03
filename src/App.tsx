import { lazy, Suspense, useEffect, useState } from 'react'
import { ENV } from '@/config/env'
import { fetchRanking } from '@/services/ranking'
import { useGameStore } from '@/state/gameStore'
import { CaptureOverlay } from '@/ui/components/CaptureOverlay'
import { useAppRuntime } from '@/ui/hooks/useAppRuntime'
import { DexScreen } from '@/ui/screens/DexScreen'
import { HandsScreen } from '@/ui/screens/HandsScreen'
import { MapScreen } from '@/ui/screens/MapScreen'
import { ProfileScreen } from '@/ui/screens/ProfileScreen'
import { RankingScreen } from '@/ui/screens/RankingScreen'
import { ResultScreen } from '@/ui/screens/ResultScreen'
import { useBoardCards, useBoardChances } from '@/ui/hooks/useGameDerived'

/** 開発ビルドでのみ読み込む。本番ビルドでは import 自体が行われない。 */
const DebugPanel = ENV.isDev ? lazy(() => import('@/dev/DebugPanel')) : null

type Tab = 'map' | 'hands' | 'dex' | 'ranking'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'map', label: 'マップ' },
  { id: 'hands', label: '役' },
  { id: 'dex', label: '図鑑' },
  { id: 'ranking', label: 'ランキング' },
]

export default function App() {
  const geo = useAppRuntime()
  const [tab, setTab] = useState<Tab>('map')
  const [showProfile, setShowProfile] = useState(false)
  const phase = useGameStore((state) => state.phase)
  const result = useGameStore((state) => state.result)
  const history = useGameStore((state) => state.history)
  const profile = useGameStore((state) => state.profile)
  const captureFeedback = useGameStore((state) => state.captureFeedback)
  const clearCaptureFeedback = useGameStore((state) => state.clearCaptureFeedback)
  const dismissResult = useGameStore((state) => state.dismissResult)
  const startGame = useGameStore((state) => state.startGame)
  const [rank, setRank] = useState<{ rank: number | null; notice: string }>({
    rank: null,
    notice: '',
  })


  const board = useBoardCards(geo.fix?.coords ?? null)
  const chances = useBoardChances(board)

  // ゲーム中は必ずマップ画面を見せる（タブ自体も隠す）
  useEffect(() => {
    if (phase === 'playing') {
      setTab('map')
      setShowProfile(false)
    }
  }, [phase])

  // 結果画面を出すタイミングでランキング順位を取りに行く
  useEffect(() => {
    if (phase !== 'result' || !result) return
    let cancelled = false
    void fetchRanking(
      'all',
      history.map((record) => record.id),
      profile.userName,
    ).then((ranking) => {
      if (cancelled) return
      const index = ranking.entries.findIndex((entry) => entry.id === result.id)
      setRank({ rank: index >= 0 ? index + 1 : null, notice: ranking.notice?.main ?? '' })
    })
    return () => {
      cancelled = true
    }
  }, [phase, result?.id])

  if (phase === 'result' && result) {
    return (
      <div className="app">
        <ResultScreen
          result={result}
          rank={rank.rank}
          rankNotice={rank.notice}
          canRetry={geo.fix !== null}
          onRetry={() => {
            dismissResult()
            setTab('map')
            startGame()
          }}
          onClose={() => {
            dismissResult()
            setTab('map')
          }}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app__body">
        {tab === 'map' && <MapScreen geo={geo} chances={chances} />}
        {tab === 'hands' && <HandsScreen chances={chances} playing={phase === 'playing'} />}
        {tab === 'dex' && <DexScreen />}
        {tab === 'ranking' && <RankingScreen onOpenProfile={() => setShowProfile(true)} />}
        {showProfile && <ProfileScreen onClose={() => setShowProfile(false)} />}
        {captureFeedback && (
          <CaptureOverlay feedback={captureFeedback} onDone={clearCaptureFeedback} />
        )}
      </div>

      {/* ゲーム中はタブを出さない。視線を地図から離さないため。 */}
      {phase !== 'playing' && (
        <nav className="tabbar">
          {TABS.map((item) => (
            <button
              type="button"
              key={item.id}
              className="tabbar__item"
              aria-selected={tab === item.id && !showProfile}
              onClick={() => {
                setShowProfile(false)
                setTab(item.id)
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </div>
  )
}
