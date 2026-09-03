import { describe, expect, it, vi } from 'vitest'
import { clearAll, loadJson, saveJson, _resetStorageProbe } from '@/services/storage'

describe('保存', () => {
  it('保存して読み戻せる', () => {
    saveJson('unit-test', { a: 1, b: 'あ' })
    expect(loadJson('unit-test', null)).toEqual({ a: 1, b: 'あ' })
  })

  it('未保存なら既定値を返す', () => {
    expect(loadJson('missing-key', { fallback: true })).toEqual({ fallback: true })
  })

  it('壊れたデータでも落ちずに既定値を返す', () => {
    window.localStorage.setItem('machi-poker/v1/broken', '{ではないもの')
    expect(loadJson('broken', 'ok')).toBe('ok')
    // 壊れたデータは消えている
    expect(window.localStorage.getItem('machi-poker/v1/broken')).toBeNull()
  })

  it('localStorage が使えなくてもアプリは動く', () => {
    _resetStorageProbe()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveJson('fallback-key', { v: 1 })).not.toThrow()
    spy.mockRestore()
    _resetStorageProbe()
  })

  it('循環参照を渡しても落ちない', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(saveJson('circular', circular)).toBe(false)
  })

  it('全消去できる', () => {
    saveJson('to-clear', 1)
    clearAll()
    expect(loadJson('to-clear', 'gone')).toBe('gone')
  })
})
