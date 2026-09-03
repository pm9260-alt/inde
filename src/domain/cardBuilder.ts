/** 地点データ (PlaceSource) から、属性と基礎点を持つカードを組み立てる */
import { ATTRIBUTE_DICTIONARY, isKanji } from '@/data/attributes'
import { CARD_POINTS } from '@/config/gameConfig'
import type { Attribute, AttributeCategory, PlaceCard, PlaceSource } from '@/domain/types'

/** 地名から属性を抽出する。同じ漢字が 2 回出てきたら属性も 2 つになる。 */
export function extractAttributes(name: string): Attribute[] {
  const attributes: Attribute[] = []
  for (const char of Array.from(name)) {
    const def = ATTRIBUTE_DICTIONARY.get(char)
    if (!def) continue
    const attribute: Attribute = { category: def.category, value: def.value, kanji: char }
    if (def.numeric !== undefined) attribute.numeric = def.numeric
    attributes.push(attribute)
  }
  return attributes
}

/** 地名に含まれる漢字を並び順のまま返す */
export function extractKanji(name: string): string[] {
  return Array.from(name).filter(isKanji)
}

/** 基礎点を計算する。カテゴリごとの加点対象には上限がある。 */
export function calculateBasePoints(attributes: Attribute[]): number {
  const counted = new Map<AttributeCategory, number>()
  let points = CARD_POINTS.base
  for (const attribute of attributes) {
    const used = counted.get(attribute.category) ?? 0
    if (used >= CARD_POINTS.maxPerCategory) continue
    counted.set(attribute.category, used + 1)
    points += CARD_POINTS.perAttribute[attribute.category]
  }
  return Math.min(points, CARD_POINTS.cap)
}

export function buildCard(source: PlaceSource): PlaceCard {
  const attributes = extractAttributes(source.name)
  return {
    ...source,
    kanji: extractKanji(source.name),
    attributes,
    basePoints: calculateBasePoints(attributes),
  }
}

export function buildCards(sources: readonly PlaceSource[]): PlaceCard[] {
  return sources.map(buildCard)
}
