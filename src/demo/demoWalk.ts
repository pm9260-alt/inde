/**
 * デモ版だけの「歩く」再現。
 *
 * 外を実際に歩かなくてもゲームループを試せるように、
 * 現在地を目的地までゆっくり動かす。
 * 通常の本番ビルド（VITE_DEMO_MODE が未設定）では何も起きない。
 */
import { IS_DEMO } from '@/config/env'
import { distanceMeters, type LatLng } from '@/domain/geo'
import { geolocation } from '@/services/geolocation'

/** デモの出発地点（東京駅） */
export const DEMO_START: LatLng = { lat: 35.6812, lng: 139.7671 }

const STEP_MS = 60
const MIN_DURATION_MS = 1_800
const MAX_DURATION_MS = 4_200

let timer: ReturnType<typeof setInterval> | null = null

/** デモの現在地を初期位置に置く */
export function startDemoLocation(): void {
  if (!IS_DEMO) return
  geolocation.setMockLocation(DEMO_START, 8)
}

/** 実際の位置情報に切り替える */
export function useRealLocation(): void {
  if (!IS_DEMO) return
  stopWalking()
  geolocation.clearMockLocation()
}

export function isWalking(): boolean {
  return timer !== null
}

export function stopWalking(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * 現在地から目的地まで、少しずつ動かす。
 * 戻り値を呼ぶと途中で止められる。
 */
export function walkTo(from: LatLng, to: LatLng, onFinish?: () => void): () => void {
  if (!IS_DEMO) return () => {}
  stopWalking()

  const meters = distanceMeters(from, to)
  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, MIN_DURATION_MS + (meters / 3000) * 2_400),
  )
  const steps = Math.max(1, Math.round(duration / STEP_MS))
  let step = 0

  timer = setInterval(() => {
    step += 1
    const ratio = Math.min(1, step / steps)
    // 歩き出しと止まり際をなめらかにする
    const eased = ratio < 0.5 ? 2 * ratio * ratio : 1 - (-2 * ratio + 2) ** 2 / 2
    geolocation.moveMockLocation({
      lat: from.lat + (to.lat - from.lat) * eased,
      lng: from.lng + (to.lng - from.lng) * eased,
    })
    if (ratio >= 1) {
      stopWalking()
      onFinish?.()
    }
  }, STEP_MS)

  return stopWalking
}
