/**
 * 触覚フィードバック。
 * 対応していない端末では何も起きない（エラーにしない）。
 */
export function tapFeedback(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* 無視 */
  }
}

export function captureFeedback(): void {
  tapFeedback([14, 40, 22])
}
