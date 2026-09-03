/**
 * 環境変数の読み取り。
 * 値が無くてもアプリが動くように、必ず既定値へフォールバックする。
 */

function readString(key: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

export const ENV = {
  /** Google Maps JavaScript API のキー。未設定なら簡易マップで動作する。 */
  googleMapsApiKey: readString('VITE_GOOGLE_MAPS_API_KEY'),
  /** Advanced Marker 用の Map ID（任意） */
  googleMapsMapId: readString('VITE_GOOGLE_MAPS_MAP_ID'),
  /** 共有ランキング用 Firebase プロジェクト ID（未設定なら端末内ランキングのみ） */
  firebaseProjectId: readString('VITE_FIREBASE_PROJECT_ID'),
  /** Firebase Web API キー */
  firebaseApiKey: readString('VITE_FIREBASE_API_KEY'),
  /** ランキングを保存する Firestore のコレクション名 */
  firebaseCollection: readString('VITE_FIREBASE_COLLECTION') || 'machiPokerScores',
  /** 開発ビルドかどうか。本番ビルドでは必ず false になる。 */
  isDev: import.meta.env.DEV === true,
} as const

export const hasGoogleMaps = (): boolean => ENV.googleMapsApiKey.length > 0
export const hasSharedRanking = (): boolean =>
  ENV.firebaseProjectId.length > 0 && ENV.firebaseApiKey.length > 0
