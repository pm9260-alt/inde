import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearMapsKey,
  hasGoogleMapsKey,
  hasStoredMapsKey,
  looksLikeMapsKey,
  resolveMapsKey,
  saveMapsKey,
} from '@/services/mapsKey'

const SAMPLE = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7'

beforeEach(() => {
  clearMapsKey()
})

describe('Google マップのキー', () => {
  it('未設定なら空で、簡易マップになる', () => {
    expect(resolveMapsKey()).toBe('')
    expect(hasGoogleMapsKey()).toBe(false)
    expect(hasStoredMapsKey()).toBe(false)
  })

  it('保存すると使われる', () => {
    saveMapsKey(SAMPLE)
    expect(resolveMapsKey()).toBe(SAMPLE)
    expect(hasGoogleMapsKey()).toBe(true)
    expect(hasStoredMapsKey()).toBe(true)
  })

  it('前後の空白は取り除く（貼り付け時の余分な空白対策）', () => {
    saveMapsKey(`  ${SAMPLE}\n`)
    expect(resolveMapsKey()).toBe(SAMPLE)
  })

  it('空文字を保存すると解除になる', () => {
    saveMapsKey(SAMPLE)
    saveMapsKey('   ')
    expect(hasStoredMapsKey()).toBe(false)
  })

  it('削除できる', () => {
    saveMapsKey(SAMPLE)
    clearMapsKey()
    expect(hasGoogleMapsKey()).toBe(false)
  })

  it('明らかに形の違う文字列は弾く', () => {
    expect(looksLikeMapsKey(SAMPLE)).toBe(true)
    expect(looksLikeMapsKey('みじかい')).toBe(false)
    expect(looksLikeMapsKey('https://console.cloud.google.com/apis/credentials')).toBe(false)
    expect(looksLikeMapsKey('')).toBe(false)
  })
})
