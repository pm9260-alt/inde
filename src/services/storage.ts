/**
 * 端末内へのデータ保存。
 *
 * localStorage が使えない環境（プライベートブラウズ、容量超過）でも
 * アプリが落ちないように、すべて try/catch で包みメモリ上に退避する。
 */

const PREFIX = 'machi-poker/v1/'

/** localStorage が使えないときの退避先 */
const memoryFallback = new Map<string, string>()

let storageAvailable: boolean | null = null

function canUseStorage(): boolean {
  if (storageAvailable !== null) return storageAvailable
  try {
    const probe = `${PREFIX}__probe__`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    storageAvailable = true
  } catch {
    storageAvailable = false
  }
  return storageAvailable
}

export function loadJson<T>(key: string, fallback: T): T {
  const fullKey = PREFIX + key
  try {
    const raw = canUseStorage()
      ? window.localStorage.getItem(fullKey)
      : (memoryFallback.get(fullKey) ?? null)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || parsed === undefined) return fallback
    return parsed as T
  } catch {
    // 壊れたデータは捨てて既定値で続行する
    removeKey(key)
    return fallback
  }
}

export function saveJson(key: string, value: unknown): boolean {
  const fullKey = PREFIX + key
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return false
  }
  try {
    if (canUseStorage()) window.localStorage.setItem(fullKey, serialized)
    else memoryFallback.set(fullKey, serialized)
    return true
  } catch {
    // 容量超過などでも落とさず、メモリ上には保持する
    memoryFallback.set(fullKey, serialized)
    return false
  }
}

export function removeKey(key: string): void {
  const fullKey = PREFIX + key
  try {
    if (canUseStorage()) window.localStorage.removeItem(fullKey)
  } catch {
    /* 無視 */
  }
  memoryFallback.delete(fullKey)
}

/** 開発用のリセット。保存しているキーをすべて消す。 */
export function clearAll(): void {
  try {
    if (canUseStorage()) {
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(PREFIX)) keys.push(key)
      }
      for (const key of keys) window.localStorage.removeItem(key)
    }
  } catch {
    /* 無視 */
  }
  memoryFallback.clear()
}

export const STORAGE_KEYS = {
  profile: 'profile',
  dex: 'dex',
  history: 'history',
  activeSession: 'active-session',
  rankingCache: 'ranking-cache',
} as const

/** テスト用に内部状態を戻す */
export function _resetStorageProbe(): void {
  storageAvailable = null
  memoryFallback.clear()
}
