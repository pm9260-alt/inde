/**
 * Google Maps JavaScript API の読み込み。
 * キーが無い・読み込めないときは reject し、呼び出し側が簡易マップへ切り替える。
 */
import { ENV } from '@/config/env'

type MapsNamespace = typeof google.maps

let loadPromise: Promise<MapsNamespace> | null = null

const LOAD_TIMEOUT_MS = 12_000

export function loadGoogleMaps(): Promise<MapsNamespace> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise<MapsNamespace>((resolve, reject) => {
    if (!ENV.googleMapsApiKey) {
      reject(new Error('Google マップのキーが設定されていません'))
      return
    }
    if (typeof window === 'undefined') {
      reject(new Error('ブラウザ以外では読み込めません'))
      return
    }
    if (window.google?.maps) {
      resolve(window.google.maps)
      return
    }

    const callbackName = '__machiPokerMapsReady'
    const timer = setTimeout(() => {
      reject(new Error('Google マップの読み込みに時間がかかっています'))
    }, LOAD_TIMEOUT_MS)

    ;(window as unknown as Record<string, unknown>)[callbackName] = () => {
      clearTimeout(timer)
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('Google マップを読み込めませんでした'))
    }

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: ENV.googleMapsApiKey,
      callback: callbackName,
      language: 'ja',
      region: 'JP',
      v: 'weekly',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Google マップを読み込めませんでした'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
