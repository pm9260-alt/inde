/** テスト共通の準備 */
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
