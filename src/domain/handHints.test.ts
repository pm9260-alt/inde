import { describe, expect, it } from 'vitest'
import { buildCard } from '@/domain/cardBuilder'
import { buildHandHints } from '@/domain/handHints'

let counter = 0
const card = (name: string, municipality = '世田谷区') =>
  buildCard({
    id: `h${(counter += 1)}-${name}`,
    name,
    prefecture: '東京都',
    municipality,
    lat: 35.6,
    lng: 139.7,
  })

const texts = (names: string[], municipality?: string) =>
  buildHandHints(names.map((n) => card(n, municipality))).map((hint) => hint.text)

describe('役予告', () => {
  it('東西南北であと 1 つ足りないときに知らせる', () => {
    const hints = texts(['東京', '西荻窪', '南砂町', '上野'])
    expect(hints.some((text) => text === 'あと「北」で東西南北')).toBe(true)
  })

  it('ナンバーストレートで足りない漢数字を知らせる', () => {
    const hints = texts(['一之江', '二重橋前', '三軒茶屋', '五反田'])
    expect(hints.some((text) => text === 'あと「四」でナンバーストレート')).toBe(true)
  })

  it('同じ漢字がもう 1 枚でスリーになることを知らせる', () => {
    const hints = texts(['新宿', '新橋'])
    expect(hints.some((text) => text.includes('「新」') && text.includes('スリー'))).toBe(true)
  })

  it('同一区が続いているときに知らせる', () => {
    const hints = texts(['三軒茶屋', '下北沢', '用賀', '経堂'], '世田谷区')
    expect(hints.some((text) => text.includes('世田谷区') && text.includes('同一区'))).toBe(true)
  })

  it('残り枚数で届かない役は出さない', () => {
    // 残り 1 枚で東西南北はあと 2 つ必要 → 予告しない
    const hints = texts(['東京', '西荻窪', '上野', '池袋'])
    expect(hints.some((text) => text.includes('東西南北'))).toBe(false)
  })

  it('1 枚も取っていないうちは予告しない', () => {
    expect(buildHandHints([])).toEqual([])
  })

  it('手札が 5 枚なら予告しない', () => {
    expect(texts(['東京', '西荻窪', '南砂町', '北品川', '上野'])).toEqual([])
  })

  it('すでに成立している役は予告しない', () => {
    const hints = texts(['東京', '西荻窪', '南砂町', '北品川'])
    expect(hints.some((text) => text.includes('東西南北'))).toBe(false)
  })

  it('件数の上限を超えない', () => {
    expect(texts(['三軒茶屋', '四ツ谷', '北品川', '東京']).length).toBeLessThanOrEqual(3)
  })
})
