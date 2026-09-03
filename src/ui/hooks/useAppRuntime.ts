/**
 * アプリ全体の裏方。
 * ・現在地の購読
 * ・1 秒ごとの時間チェック（バックグラウンド復帰時も取りこぼさない）
 * ・保存データの読み込み
 */
import { useEffect, useState } from 'react'
import { geolocation, type GeoState } from '@/services/geolocation'
import { useGameStore } from '@/state/gameStore'

export function useAppRuntime(): GeoState {
  const init = useGameStore((state) => state.init)
  const updateFix = useGameStore((state) => state.updateFix)
  const tick = useGameStore((state) => state.tick)
  const [geo, setGeo] = useState<GeoState>(geolocation.getState())

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const unsubscribe = geolocation.subscribe((state) => {
      setGeo(state)
      updateFix(state.fix)
    })
    geolocation.start()
    return () => {
      unsubscribe()
    }
  }, [updateFix])

  useEffect(() => {
    const timer = setInterval(tick, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [tick])

  return geo
}
