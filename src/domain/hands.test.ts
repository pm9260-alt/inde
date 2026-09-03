import { describe, expect, it } from 'vitest'
import { buildCard } from '@/domain/cardBuilder'
import { evaluateHands } from '@/domain/hands'
import type { HandId } from '@/domain/types'

let counter = 0
const card = (name: string, municipality = '世田谷区') =>
  buildCard({
    id: `t${(counter += 1)}-${name}`,
    name,
    prefecture: '東京都',
    municipality,
    lat: 35.6,
    lng: 139.7,
  })

const ids = (names: string[], municipality?: string) => names.map((n) => card(n, municipality))
const handIds = (names: string[], municipality?: string): HandId[] =>
  evaluateHands(ids(names, municipality)).map((hand) => hand.id)

describe('ペア・スリー・フォーカード', () => {
  it('同じ漢字 2 枚でペア', () => {
    expect(handIds(['東京', '東銀座', '上野'])).toContain('pair')
  })

  it('同じ漢字 3 枚でスリー（ペアは重ねて出さない）', () => {
    const hands = handIds(['東京', '東銀座', '東日本橋'])
    expect(hands).toContain('three')
    expect(hands).not.toContain('pair')
  })

  it('同じ漢字 4 枚でフォーカード', () => {
    const hands = handIds(['東京', '東銀座', '東日本橋', '東陽町'])
    expect(hands).toContain('four')
    expect(hands).not.toContain('three')
  })

  it('属性を持たない漢字は対象にしない（辞書モードのとき）', () => {
    // 「新」は属性辞書に無いので、そろえても役にはならない
    expect(handIds(['新宿', '新橋', '新木場'])).not.toContain('three')
  })

  it('共通の漢字がなければ成立しない', () => {
    expect(handIds(['渋谷', '池袋'])).not.toContain('pair')
  })
})

describe('東西南北', () => {
  it('4 方角がそろえば成立', () => {
    expect(handIds(['東京', '西荻窪', '南砂町', '北品川', '上野'])).toContain('compass')
  })

  it('1 つ欠けたら成立しない', () => {
    expect(handIds(['東京', '西荻窪', '南砂町', '上野'])).not.toContain('compass')
  })

  it('同じカードを 2 方角に使い回すことはできない', () => {
    // 「東西線」のような 1 枚で 2 方角を持つカードがあっても、枚数は足りない扱い
    expect(handIds(['東西', '南砂町', '北品川'])).not.toContain('compass')
  })
})

describe('ナンバーストレート', () => {
  it('一二三四五で成立', () => {
    expect(handIds(['一之江', '二重橋前', '三軒茶屋', '四ツ谷', '五反田'])).toContain(
      'numberStraight',
    )
  })

  it('二三四五六でも成立', () => {
    expect(handIds(['二子玉川', '三田', '四ツ木', '五反野', '六本木'])).toContain('numberStraight')
  })

  it('連続していなければ成立しない', () => {
    expect(handIds(['一之江', '二重橋前', '三軒茶屋', '四ツ谷', '六本木'])).not.toContain(
      'numberStraight',
    )
  })

  it('5 枚に満たなければ成立しない', () => {
    expect(handIds(['一之江', '二重橋前', '三軒茶屋', '四ツ谷'])).not.toContain('numberStraight')
  })
})

describe('カラー・動物園', () => {
  it('異なる色 3 種類でカラー', () => {
    expect(handIds(['赤羽', '青山一丁目', '目黒'])).toContain('color')
  })

  it('同じ色ばかりでは成立しない', () => {
    expect(handIds(['赤羽', '赤坂', '赤土小学校前'])).not.toContain('color')
  })

  it('異なる動物 3 種類で動物園', () => {
    expect(handIds(['練馬', '亀戸', '虎ノ門'])).toContain('zoo')
  })
})

describe('山川', () => {
  it('山 3 枚と川 2 枚で成立', () => {
    expect(handIds(['青山一丁目', '大岡山', '白山', '品川', '小川町'])).toContain('mountainRiver')
  })

  it('川が足りなければ成立しない', () => {
    expect(handIds(['青山一丁目', '大岡山', '白山', '品川', '上野'])).not.toContain('mountainRiver')
  })

  it('1 枚を山と川の両方には使えない', () => {
    // 「山川」1 枚 + 山 2 枚 では、川がもう 1 枚足りない
    expect(handIds(['山川', '大岡山', '白山', '上野', '池袋'])).not.toContain('mountainRiver')
  })
})

describe('同一区', () => {
  it('5 枚すべて同じ区で成立', () => {
    expect(handIds(['三軒茶屋', '下北沢', '用賀', '経堂', '豪徳寺'], '世田谷区')).toContain(
      'sameMunicipality',
    )
  })

  it('4 枚では成立しない', () => {
    expect(handIds(['三軒茶屋', '下北沢', '用賀', '経堂'], '世田谷区')).not.toContain(
      'sameMunicipality',
    )
  })

  it('1 枚でも別の区が混ざれば成立しない', () => {
    const cards = [
      card('三軒茶屋', '世田谷区'),
      card('下北沢', '世田谷区'),
      card('用賀', '世田谷区'),
      card('経堂', '世田谷区'),
      card('渋谷', '渋谷区'),
    ]
    expect(evaluateHands(cards).map((h) => h.id)).not.toContain('sameMunicipality')
  })
})

describe('ミックス', () => {
  it('異なる 3 カテゴリで 2 枚ずつあれば成立', () => {
    // 数字: 三軒茶屋・四ツ谷 / 方角: 北品川・東京 / 自然: 北品川・渋谷
    expect(handIds(['三軒茶屋', '四ツ谷', '北品川', '東京', '渋谷'])).toContain('mixed')
  })

  it('2 カテゴリだけでは成立しない', () => {
    // 数字 2 枚・色 2 枚だけ（自然や方角は 1 枚も無い）
    expect(handIds(['三軒茶屋', '五反田', '赤羽', '赤坂', '上野'])).not.toContain('mixed')
  })
})

describe('並び順', () => {
  it('倍率の高い役が先頭に来る', () => {
    const hands = evaluateHands(ids(['東京', '西荻窪', '南砂町', '北品川', '北千住']))
    expect(hands.length).toBeGreaterThan(1)
    for (let i = 1; i < hands.length; i += 1) {
      expect(hands[i - 1]!.multiplier).toBeGreaterThanOrEqual(hands[i]!.multiplier)
    }
  })

  it('手札が空なら役なし', () => {
    expect(evaluateHands([])).toEqual([])
  })
})
