/**
 * 地名属性の辞書。
 *
 * 「漢字 1 文字 → 属性」の対応表。ここに 1 行足すだけで属性を増やせる。
 * MVP なので巨大な辞書にはしていない。
 */
import type { AttributeCategory } from '@/domain/types'

export interface AttributeDefinition {
  category: AttributeCategory
  /** 表示・役判定に使う値 */
  value: string
  /** 数字属性のときだけ設定する */
  numeric?: number
}

/** 漢数字 → 数字属性 */
const NUMBER_KANJI: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

/** 方角 */
const DIRECTION_KANJI = ['東', '西', '南', '北'] as const

/** 色 */
const COLOR_KANJI = ['赤', '青', '白', '黒', '緑', '黄'] as const

/** 自然 */
const NATURE_KANJI = ['山', '川', '海', '谷', '池'] as const

/** 動物 */
const ANIMAL_KANJI = ['馬', '鹿', '鳥', '鶴', '亀', '牛', '虎', '熊', '猫', '犬'] as const

function buildDictionary(): Map<string, AttributeDefinition> {
  const dict = new Map<string, AttributeDefinition>()
  for (const [kanji, numeric] of Object.entries(NUMBER_KANJI)) {
    dict.set(kanji, { category: 'number', value: String(numeric), numeric })
  }
  for (const kanji of DIRECTION_KANJI) dict.set(kanji, { category: 'direction', value: kanji })
  for (const kanji of COLOR_KANJI) dict.set(kanji, { category: 'color', value: kanji })
  for (const kanji of NATURE_KANJI) dict.set(kanji, { category: 'nature', value: kanji })
  for (const kanji of ANIMAL_KANJI) dict.set(kanji, { category: 'animal', value: kanji })
  return dict
}

/** 漢字 1 文字 → 属性定義 */
export const ATTRIBUTE_DICTIONARY: ReadonlyMap<string, AttributeDefinition> = buildDictionary()

export const DIRECTION_SET: readonly string[] = DIRECTION_KANJI
export const COLOR_SET: readonly string[] = COLOR_KANJI
export const NATURE_SET: readonly string[] = NATURE_KANJI
export const ANIMAL_SET: readonly string[] = ANIMAL_KANJI

/** カテゴリの日本語表示名 */
export const CATEGORY_LABEL: Record<AttributeCategory, string> = {
  number: '数字',
  direction: '方角',
  color: '色',
  nature: '自然',
  animal: '動物',
}

/** 漢字かどうか（CJK 統合漢字）。ひらがな・カタカナ・記号は除く。 */
export function isKanji(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  )
}
