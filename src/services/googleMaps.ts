/**
 * Google Maps JavaScript API の読み込み。
 * キーが無い・読み込めないときは reject し、呼び出し側が簡易マップへ切り替える。
 */
import { resolveMapsKey } from '@/services/mapsKey'

type MapsNamespace = typeof google.maps

let loadPromise: Promise<MapsNamespace> | null = null

const LOAD_TIMEOUT_MS = 10_000

/* ------------------------------------------------------------------ *
 * キーが受け付けられなかったときの通知
 *
 * 読み込み自体は成功しても、キーの制限や設定が理由で Google 側に
 * 断られることがある。そのとき Google は window.gm_authFailure を呼ぶので、
 * それを受け取って簡易マップへ戻せるようにしておく。
 * ------------------------------------------------------------------ */

type AuthFailureListener = () => void

const authFailureListeners = new Set<AuthFailureListener>()
let authFailed = false

export function onMapsAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener)
  if (authFailed) listener()
  return () => {
    authFailureListeners.delete(listener)
  }
}

export function hasMapsAuthFailed(): boolean {
  return authFailed
}

function registerAuthFailureHandler(): void {
  ;(window as unknown as Record<string, unknown>).gm_authFailure = () => {
    authFailed = true
    for (const listener of authFailureListeners) listener()
  }
}

/**
 * キーが断られた理由として考えられることを、1 行の案内にする。
 * 正確な理由は Google 側しか知らないため、多い順に絞って伝える。
 */
export function mapsAuthFailureHint(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'パソコンのファイルを直接開いているため、キーの制限にかかっています'
  }
  return 'キーの制限、地図の有効化、請求先の設定を確認してください'
}

export function loadGoogleMaps(): Promise<MapsNamespace> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise<MapsNamespace>((resolve, reject) => {
    const apiKey = resolveMapsKey()
    if (!apiKey) {
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
      reject(new Error('読み込みに時間がかかりすぎました'))
    }, LOAD_TIMEOUT_MS)

    ;(window as unknown as Record<string, unknown>)[callbackName] = () => {
      clearTimeout(timer)
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('地図を読み込めませんでした'))
    }

    registerAuthFailureHandler()

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: apiKey,
      callback: callbackName,
      language: 'ja',
      region: 'JP',
      v: 'weekly',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('キーが違うか、通信できていない可能性があります'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
