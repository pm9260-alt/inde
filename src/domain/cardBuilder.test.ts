import { describe, expect, it } from 'vitest'
import { buildCard, calculateBasePoints, extractAttributes } from '@/domain/cardBuilder'
import { CARD_POINTS } from '@/config/gameConfig'
import { PLACE_SOURCES } from '@/data/stations'

const source = (name: string, municipality = '世田谷区') => ({
  id: `test-${name}`,
  name,
  prefecture: '東京都',
  municipality,
  lat: 35.0,
  lng: 139.0,
})

describe('属性の抽出', () => {
  it('漢数字を数字属性として認識する', () => {
    const attributes = extractAttributes('三軒茶屋')
    expect(attributes).toHaveLength(1)
    expect(attributes[0]).toMatchObject({ category: 'number', value: '3', kanji: '三', numeric: 3 })
  })

  it('方角・色・自然・動物をそれぞれ認識する', () => {
    expect(extractAttributes('北品川').map((a) => a.category)).toEqual(['direction', 'nature'])
    expect(extractAttributes('目黒')[0]).toMatchObject({ category: 'color', value: '黒' })
    expect(extractAttributes('練馬')[0]).toMatchObject({ category: 'animal', value: '馬' })
    expect(extractAttributes('渋谷')[0]).toMatchObject({ category: 'nature', value: '谷' })
  })

  it('同じ漢字が 2 回出たら属性も 2 つになる', () => {
    expect(extractAttributes('東東')).toHaveLength(2)
  })

  it('属性を持たない地名では空になる', () => {
    expect(extractAttributes('恵比寿')).toEqual([])
  })
})

describe('漢字の抽出', () => {
  it('ひらがな・カタカナ・記号を除く', () => {
    expect(buildCard(source('お花茶屋')).kanji).toEqual(['花', '茶', '屋'])
    expect(buildCard(source('とうきょうスカイツリー')).kanji).toEqual([])
    expect(buildCard(source('霞ケ関')).kanji).toEqual(['霞', '関'])
  })
})

describe('基礎点', () => {
  it('属性なしは base のまま', () => {
    expect(calculateBasePoints([])).toBe(CARD_POINTS.base)
  })

  it('属性がつくほど高くなる', () => {
    const plain = buildCard(source('恵比寿')).basePoints
    const withNumber = buildCard(source('三軒茶屋')).basePoints
    const withAnimal = buildCard(source('練馬')).basePoints
    expect(withNumber).toBeGreaterThan(plain)
    expect(withAnimal).toBeGreaterThan(withNumber)
  })

  it('同じカテゴリの加点には上限がある', () => {
    const many = calculateBasePoints(extractAttributes('東東東東'))
    expect(many).toBe(CARD_POINTS.base + CARD_POINTS.perAttribute.direction * CARD_POINTS.maxPerCategory)
  })

  it('上限を超えない', () => {
    const attributes = extractAttributes('東西赤青山川馬鹿一二')
    expect(calculateBasePoints(attributes)).toBeLessThanOrEqual(CARD_POINTS.cap)
  })
})

describe('収録データ', () => {
  it('ID が重複していない', () => {
    const ids = PLACE_SOURCES.map((place) => place.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('座標が東京 23 区の範囲に収まっている', () => {
    for (const place of PLACE_SOURCES) {
      expect(place.lat, place.name).toBeGreaterThan(35.5)
      expect(place.lat, place.name).toBeLessThan(35.9)
      expect(place.lng, place.name).toBeGreaterThan(139.5)
      expect(place.lng, place.name).toBeLessThan(139.95)
      expect(place.prefecture).toBe('東京都')
      expect(place.municipality).toMatch(/区$/)
    }
  })

  it('十分な件数がある', () => {
    expect(PLACE_SOURCES.length).toBeGreaterThanOrEqual(200)
  })
})
