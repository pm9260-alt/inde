/**
 * Google マップのキーの保管場所。
 *
 * 設定ファイル（.env）を書き換えなくても、アプリの画面から貼り付けて使えるようにする。
 * 優先順位は「画面から入れたキー」→「.env のキー」。
 * キーはこの端末のブラウザにだけ保存され、どこにも送信しない。
 */
import { ENV } from '@/config/env'
import { loadJson, saveJson, removeKey } from '@/services/storage'

const STORAGE_KEY = 'google-maps-key'

/** 実際に使うキー。未設定なら空文字。 */
export function resolveMapsKey(): string {
  const stored = loadJson<string>(STORAGE_KEY, '')
  if (typeof stored === 'string' && stored.trim()) return stored.trim()
  return ENV.googleMapsApiKey
}

/** 画面から入れたキーがあるか（.env のキーは含めない） */
export function hasStoredMapsKey(): boolean {
  const stored = loadJson<string>(STORAGE_KEY, '')
  return typeof stored === 'string' && stored.trim().length > 0
}

export function saveMapsKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed) saveJson(STORAGE_KEY, trimmed)
  else removeKey(STORAGE_KEY)
}

export function clearMapsKey(): void {
  removeKey(STORAGE_KEY)
}

/** Google マップを使える状態か（画面から入れたキー・.env のどちらでも可） */
export function hasGoogleMapsKey(): boolean {
  return resolveMapsKey().length > 0
}

/** キーらしい形かどうかの軽い確認（貼り間違いを早めに知らせるため） */
export function looksLikeMapsKey(key: string): boolean {
  const trimmed = key.trim()
  return trimmed.length >= 30 && /^[A-Za-z0-9_-]+$/.test(trimmed)
}
