/**
 * 役判定。
 *
 * 手札 0〜5 枚のどの状態でも呼べる（ゲーム中の暫定表示にも使う）。
 * 倍率・必要枚数はすべて src/config/gameConfig.ts の定数を参照する。
 */
import { HAND_DEFINITIONS, HAND_RULES, TARGET_KANJI_MODE } from '@/config/gameConfig'
import { ATTRIBUTE_DICTIONARY, ANIMAL_SET, COLOR_SET, DIRECTION_SET } from '@/data/attributes'
import type { AttributeCategory, HandId, HandResult, PlaceCard } from '@/domain/types'

/* ---------------------------------------------------------------- *
 * 共通ヘルパー
 * ---------------------------------------------------------------- */

/** 役判定の対象になる漢字（重複なし）をカードから取り出す */
export function targetKanjiOf(card: PlaceCard): string[] {
  const source =
    TARGET_KANJI_MODE === 'dictionary'
      ? card.kanji.filter((k) => ATTRIBUTE_DICTIONARY.has(k))
      : card.kanji
  return Array.from(new Set(source))
}

/** カードが持つ、指定カテゴリの属性値（重複なし） */
export function valuesOf(card: PlaceCard, category: AttributeCategory): string[] {
  return Array.from(
    new Set(card.attributes.filter((a) => a.category === category).map((a) => a.value)),
  )
}

function hasValue(card: PlaceCard, category: AttributeCategory, value: string): boolean {
  return card.attributes.some((a) => a.category === category && a.value === value)
}

/** 漢字ごとに「その漢字を含むカード」を集める */
export function kanjiToCards(cards: readonly PlaceCard[]): Map<string, PlaceCard[]> {
  const map = new Map<string, PlaceCard[]>()
  for (const card of cards) {
    for (const kanji of targetKanjiOf(card)) {
      const list = map.get(kanji)
      if (list) list.push(card)
      else map.set(kanji, [card])
    }
  }
  return map
}

/**
 * 二部マッチング（ハンガリアン法の簡易版）。
 * slots[i] に割り当て可能なカード添字の集合を渡すと、最大何スロット埋まるかと
 * その割り当てを返す。手札は最大 5 枚なので素朴な実装で十分。
 */
function maxMatching(slots: readonly number[][]): number[] {
  const assignedCardToSlot = new Map<number, number>()

  const tryAssign = (slot: number, visited: Set<number>): boolean => {
    for (const cardIndex of slots[slot] ?? []) {
      if (visited.has(cardIndex)) continue
      visited.add(cardIndex)
      const holder = assignedCardToSlot.get(cardIndex)
      if (holder === undefined || tryAssign(holder, visited)) {
        assignedCardToSlot.set(cardIndex, slot)
        return true
      }
    }
    return false
  }

  const result: number[] = new Array(slots.length).fill(-1)
  for (let slot = 0; slot < slots.length; slot += 1) tryAssign(slot, new Set())
  for (const [cardIndex, slot] of assignedCardToSlot) result[slot] = cardIndex
  return result
}

function makeHand(id: HandId, detail: string, cardIds: string[]): HandResult {
  const def = HAND_DEFINITIONS[id]
  return { id, name: def.name, multiplier: def.multiplier, detail, cardIds }
}

/* ---------------------------------------------------------------- *
 * 個別の役
 * ---------------------------------------------------------------- */

/** ①②③ ペア／スリー／フォーカード（成立した最上位のものだけを返す） */
function evaluateSameKanji(cards: readonly PlaceCard[]): HandResult | null {
  let best: { kanji: string; matched: PlaceCard[] } | null = null
  for (const [kanji, matched] of kanjiToCards(cards)) {
    if (matched.length < 2) continue
    if (!best || matched.length > best.matched.length) best = { kanji, matched }
  }
  if (!best) return null

  const count = best.matched.length
  const id: HandId = count >= 4 ? 'four' : count >= 3 ? 'three' : 'pair'
  return makeHand(
    id,
    `「${best.kanji}」が ${count} 枚`,
    best.matched.map((c) => c.id),
  )
}

/** ④ 東西南北 */
function evaluateCompass(cards: readonly PlaceCard[]): HandResult | null {
  const slots = DIRECTION_SET.map((direction) =>
    cards.reduce<number[]>((acc, card, index) => {
      if (hasValue(card, 'direction', direction)) acc.push(index)
      return acc
    }, []),
  )
  const assignment = maxMatching(slots)
  if (assignment.some((cardIndex) => cardIndex < 0)) return null
  return makeHand(
    'compass',
    '東・西・南・北がすべてそろった',
    assignment.map((index) => cards[index]!.id),
  )
}

/** ⑤ ナンバーストレート */
function evaluateNumberStraight(cards: readonly PlaceCard[]): HandResult | null {
  const length = HAND_RULES.straightLength
  if (cards.length < length) return null

  for (let start = 1; start + length - 1 <= 10; start += 1) {
    const slots: number[][] = []
    for (let offset = 0; offset < length; offset += 1) {
      const target = String(start + offset)
      slots.push(
        cards.reduce<number[]>((acc, card, index) => {
          if (hasValue(card, 'number', target)) acc.push(index)
          return acc
        }, []),
      )
    }
    const assignment = maxMatching(slots)
    if (assignment.every((cardIndex) => cardIndex >= 0)) {
      return makeHand(
        'numberStraight',
        `${start} から ${start + length - 1} までの数字がそろった`,
        assignment.map((index) => cards[index]!.id),
      )
    }
  }
  return null
}

/** 異なる属性値の種類数で成立する役（カラー・動物園）の共通処理 */
function evaluateDistinctKinds(
  cards: readonly PlaceCard[],
  category: AttributeCategory,
  requiredKinds: number,
  id: HandId,
  label: string,
): HandResult | null {
  const kinds = new Set<string>()
  const used: string[] = []
  for (const card of cards) {
    const values = valuesOf(card, category)
    if (values.length === 0) continue
    const before = kinds.size
    for (const value of values) kinds.add(value)
    if (kinds.size > before) used.push(card.id)
  }
  if (kinds.size < requiredKinds) return null
  return makeHand(id, `${label} ${Array.from(kinds).join('・')}`, used)
}

/** ⑧ 山川 */
function evaluateMountainRiver(cards: readonly PlaceCard[]): HandResult | null {
  const need = { mountain: HAND_RULES.mountainRequiredCards, river: HAND_RULES.riverRequiredCards }
  if (cards.length < need.mountain + need.river) return null

  const mountainIdx = cards.reduce<number[]>((acc, card, index) => {
    if (hasValue(card, 'nature', '山')) acc.push(index)
    return acc
  }, [])
  const riverIdx = cards.reduce<number[]>((acc, card, index) => {
    if (hasValue(card, 'nature', '川')) acc.push(index)
    return acc
  }, [])
  if (mountainIdx.length < need.mountain || riverIdx.length < need.river) return null

  // 手札は最大 5 枚なので、山に使う組み合わせを総当たりして川と重ならないか確かめる
  const combinations = (pool: number[], size: number): number[][] => {
    if (size === 0) return [[]]
    const out: number[][] = []
    for (let i = 0; i <= pool.length - size; i += 1) {
      for (const rest of combinations(pool.slice(i + 1), size - 1)) {
        out.push([pool[i]!, ...rest])
      }
    }
    return out
  }

  for (const mountainPick of combinations(mountainIdx, need.mountain)) {
    const remaining = riverIdx.filter((index) => !mountainPick.includes(index))
    if (remaining.length >= need.river) {
      const riverPick = remaining.slice(0, need.river)
      return makeHand(
        'mountainRiver',
        `山 ${need.mountain} 枚・川 ${need.river} 枚`,
        [...mountainPick, ...riverPick].map((index) => cards[index]!.id),
      )
    }
  }
  return null
}

/** ⑨ 同一区 */
function evaluateSameMunicipality(cards: readonly PlaceCard[]): HandResult | null {
  const required = HAND_RULES.sameMunicipalityRequiredCards
  if (cards.length < required) return null
  const first = cards[0]!.municipality
  if (!cards.every((card) => card.municipality === first)) return null
  return makeHand(
    'sameMunicipality',
    `すべて ${first}`,
    cards.map((card) => card.id),
  )
}

/** ⑩ ミックス */
function evaluateMixed(cards: readonly PlaceCard[]): HandResult | null {
  const categories: AttributeCategory[] = ['number', 'direction', 'color', 'nature', 'animal']
  const satisfied: AttributeCategory[] = []
  const used = new Set<string>()
  for (const category of categories) {
    const matched = cards.filter((card) => valuesOf(card, category).length > 0)
    if (matched.length >= HAND_RULES.mixedCardsPerCategory) {
      satisfied.push(category)
      for (const card of matched) used.add(card.id)
    }
  }
  if (satisfied.length < HAND_RULES.mixedRequiredCategories) return null
  return makeHand(
    'mixed',
    `${satisfied.length} 種類のカテゴリで条件を満たした`,
    Array.from(used),
  )
}

/* ---------------------------------------------------------------- *
 * まとめ
 * ---------------------------------------------------------------- */

/** 手札から成立している役をすべて返す（倍率の高い順） */
export function evaluateHands(cards: readonly PlaceCard[]): HandResult[] {
  if (cards.length === 0) return []
  const results: (HandResult | null)[] = [
    evaluateSameKanji(cards),
    evaluateCompass(cards),
    evaluateNumberStraight(cards),
    evaluateDistinctKinds(cards, 'color', HAND_RULES.colorRequiredKinds, 'color', '色'),
    evaluateDistinctKinds(cards, 'animal', HAND_RULES.zooRequiredKinds, 'zoo', '動物'),
    evaluateMountainRiver(cards),
    evaluateSameMunicipality(cards),
    evaluateMixed(cards),
  ]
  return results
    .filter((result): result is HandResult => result !== null)
    .sort((a, b) => b.multiplier - a.multiplier || a.id.localeCompare(b.id))
}

export const _internals = { maxMatching, COLOR_SET, ANIMAL_SET }
