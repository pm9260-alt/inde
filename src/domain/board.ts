/**
 * 盤面（今回の候補カード）の組み立てと分析。
 *
 * ・毎ゲーム、周辺から一定枚数だけを抽選して盤面を作る
 *   → 同じ場所から始めても、狙える役が毎回変わる
 * ・その盤面で何が狙えるかを調べ、開始前の判断材料にする
 *   （どこへ行けばよいかまでは示さない）
 */
import { GAME_RULES, HAND_DEFINITIONS, HAND_RULES } from '@/config/gameConfig'
import { ANIMAL_SET, COLOR_SET, DIRECTION_SET } from '@/data/attributes'
import { kanjiToCards, valuesOf } from '@/domain/hands'
import type { HandId, PlaceCard } from '@/domain/types'

/* ---------------------------------------------------------------- *
 * 乱数（同じ種を渡せば同じ盤面になる）
 * ---------------------------------------------------------------- */

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------------------------------------------------------- *
 * 盤面の分析
 * ---------------------------------------------------------------- */

export interface BoardChance {
  handId: HandId
  name: string
  multiplier: number
  /** 「東・西・南・北がそろっています」のような手がかり 1 行 */
  note: string
}

function cardsWith(cards: readonly PlaceCard[], category: Parameters<typeof valuesOf>[1], value: string) {
  return cards.filter((card) => valuesOf(card, category).includes(value))
}

function distinctValues(cards: readonly PlaceCard[], category: Parameters<typeof valuesOf>[1]) {
  const values = new Set<string>()
  for (const card of cards) for (const value of valuesOf(card, category)) values.add(value)
  return values
}

const NUMBER_KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/** その盤面で成立させられる役を、倍率の高い順に返す */
export function analyzeBoard(cards: readonly PlaceCard[]): BoardChance[] {
  const chances: BoardChance[] = []
  const add = (handId: HandId, note: string) => {
    const def = HAND_DEFINITIONS[handId]
    chances.push({ handId, name: def.name, multiplier: def.multiplier, note })
  }

  /* ナンバーストレート */
  const length = HAND_RULES.straightLength
  for (let start = 1; start + length - 1 <= 10; start += 1) {
    const numbers = Array.from({ length }, (_, offset) => String(start + offset))
    if (numbers.every((value) => cardsWith(cards, 'number', value).length > 0)) {
      const label = numbers.map((value) => NUMBER_KANJI[Number(value)] ?? value)
      add('numberStraight', `${label[0]}〜${label[label.length - 1]} がそろいます`)
      break
    }
  }

  /* 山川 */
  const mountains = cardsWith(cards, 'nature', '山')
  const rivers = cardsWith(cards, 'nature', '川')
  const overlap = mountains.filter((card) => rivers.includes(card)).length
  if (
    mountains.length >= HAND_RULES.mountainRequiredCards &&
    rivers.length >= HAND_RULES.riverRequiredCards &&
    mountains.length + rivers.length - overlap >=
      HAND_RULES.mountainRequiredCards + HAND_RULES.riverRequiredCards
  ) {
    add('mountainRiver', `山 ${mountains.length} 駅・川 ${rivers.length} 駅があります`)
  }

  /* 東西南北 */
  const missingDirections = DIRECTION_SET.filter(
    (direction) => cardsWith(cards, 'direction', direction).length === 0,
  )
  if (missingDirections.length === 0) add('compass', '東・西・南・北がすべてあります')

  /* 同じ漢字（フォーカード・スリー・ペア） */
  let topKanji: { kanji: string; count: number } | null = null
  for (const [kanji, matched] of kanjiToCards(cards)) {
    if (!topKanji || matched.length > topKanji.count) topKanji = { kanji, count: matched.length }
  }
  if (topKanji && topKanji.count >= 4) add('four', `「${topKanji.kanji}」が ${topKanji.count} 駅あります`)
  else if (topKanji && topKanji.count === 3) add('three', `「${topKanji.kanji}」が 3 駅あります`)
  else if (topKanji && topKanji.count === 2) add('pair', `「${topKanji.kanji}」が 2 駅あります`)

  /* 動物園 */
  const animals = distinctValues(cards, 'animal')
  if (animals.size >= HAND_RULES.zooRequiredKinds) {
    add('zoo', `${Array.from(animals).slice(0, 4).join('・')} がいます`)
  }

  /* カラー */
  const colors = distinctValues(cards, 'color')
  if (colors.size >= HAND_RULES.colorRequiredKinds) {
    add('color', `${Array.from(colors).slice(0, 4).join('・')} がそろいます`)
  }

  /* 同一区 */
  const byMunicipality = new Map<string, number>()
  for (const card of cards) {
    byMunicipality.set(card.municipality, (byMunicipality.get(card.municipality) ?? 0) + 1)
  }
  for (const [municipality, count] of byMunicipality) {
    if (count >= HAND_RULES.sameMunicipalityRequiredCards) {
      add('sameMunicipality', `${municipality}に ${count} 駅あります`)
      break
    }
  }

  /* ミックス */
  const categories = (['number', 'direction', 'color', 'nature', 'animal'] as const).filter(
    (category) => cards.filter((card) => valuesOf(card, category).length > 0).length >= HAND_RULES.mixedCardsPerCategory,
  )
  if (categories.length >= HAND_RULES.mixedRequiredCategories) {
    add('mixed', `${categories.length} 種類の属性がまんべんなくあります`)
  }

  return chances.sort((a, b) => b.multiplier - a.multiplier)
}

/* ---------------------------------------------------------------- *
 * 盤面の抽選
 * ---------------------------------------------------------------- */

/** 抽選で使う設定 */
export const DECK_RULES = {
  /** 1 ゲームの候補カード枚数 */
  size: 20,
  /**
   * 必ず入れる、いちばん近い駅の数。
   * 手札 5 枚ぶんを必ず含めることで、
   *   「近場でまとめて手堅く終える」か「お題を狙って遠くまで歩く」か
   * をプレイヤーが選べるようにする。
   */
  alwaysNearest: 5,
  /** お題の材料を選ぶとき、近いものから何駅を候補にするか */
  themePickWindow: 4,
  /** 盤面を作り直す距離 (m) */
  refreshDistanceMeters: 800,
} as const

/**
 * その盤面の「お題」。
 *
 * 毎ゲーム 1 つ選び、その役を成立させられる材料を必ず盤面に入れる。
 * こうすると、同じ場所から始めても
 *   今回は東西南北が狙える / 次は数字が多い / 次は同一区
 * と盤面の性格が変わり、覚えたルートをなぞるだけにならない。
 *
 * どのお題かは画面には出さない。プレイヤーは盤面を見て自分で気づく。
 */
interface Theme {
  id: HandId
  /** 材料を集める。集められないときは null。 */
  pick: (pool: readonly PlaceCard[], random: () => number) => PlaceCard[] | null
}

/** 近いものを優先しつつ、少しばらけさせて 1 枚選ぶ */
function pickOne(
  matches: readonly PlaceCard[],
  random: () => number,
  used: ReadonlySet<string>,
): PlaceCard | null {
  const available = matches.filter((card) => !used.has(card.id))
  if (available.length === 0) return null
  const window = available.slice(0, DECK_RULES.themePickWindow)
  return window[Math.floor(random() * window.length)] ?? null
}

function pickMany(
  matches: readonly PlaceCard[],
  count: number,
  random: () => number,
  used: Set<string>,
): PlaceCard[] | null {
  const picked: PlaceCard[] = []
  for (let i = 0; i < count; i += 1) {
    const card = pickOne(matches, random, used)
    if (!card) return null
    used.add(card.id)
    picked.push(card)
  }
  return picked
}

const THEMES: Theme[] = [
  {
    id: 'compass',
    pick: (pool, random) => {
      const used = new Set<string>()
      const picked: PlaceCard[] = []
      for (const direction of DIRECTION_SET) {
        const card = pickOne(cardsWith(pool, 'direction', direction), random, used)
        if (!card) return null
        used.add(card.id)
        picked.push(card)
      }
      return picked
    },
  },
  {
    id: 'numberStraight',
    pick: (pool, random) => {
      const length = HAND_RULES.straightLength
      const starts: number[] = []
      for (let start = 1; start + length - 1 <= 10; start += 1) {
        const ok = Array.from({ length }, (_, offset) => String(start + offset)).every(
          (value) => cardsWith(pool, 'number', value).length > 0,
        )
        if (ok) starts.push(start)
      }
      if (starts.length === 0) return null
      const start = starts[Math.floor(random() * starts.length)]!
      const used = new Set<string>()
      const picked: PlaceCard[] = []
      for (let offset = 0; offset < length; offset += 1) {
        const card = pickOne(cardsWith(pool, 'number', String(start + offset)), random, used)
        if (!card) return null
        used.add(card.id)
        picked.push(card)
      }
      return picked
    },
  },
  {
    id: 'mountainRiver',
    pick: (pool, random) => {
      const used = new Set<string>()
      const mountains = pickMany(cardsWith(pool, 'nature', '山'), HAND_RULES.mountainRequiredCards, random, used)
      if (!mountains) return null
      const rivers = pickMany(cardsWith(pool, 'nature', '川'), HAND_RULES.riverRequiredCards, random, used)
      if (!rivers) return null
      return [...mountains, ...rivers]
    },
  },
  {
    id: 'zoo',
    pick: (pool, random) => {
      const used = new Set<string>()
      const picked: PlaceCard[] = []
      const kinds = ANIMAL_SET.filter((animal) => cardsWith(pool, 'animal', animal).length > 0)
      if (kinds.length < HAND_RULES.zooRequiredKinds) return null
      for (const animal of shuffle(kinds, random).slice(0, HAND_RULES.zooRequiredKinds)) {
        const card = pickOne(cardsWith(pool, 'animal', animal), random, used)
        if (!card) return null
        used.add(card.id)
        picked.push(card)
      }
      return picked
    },
  },
  {
    id: 'color',
    pick: (pool, random) => {
      const used = new Set<string>()
      const picked: PlaceCard[] = []
      const kinds = COLOR_SET.filter((color) => cardsWith(pool, 'color', color).length > 0)
      if (kinds.length < HAND_RULES.colorRequiredKinds) return null
      for (const color of shuffle(kinds, random).slice(0, HAND_RULES.colorRequiredKinds)) {
        const card = pickOne(cardsWith(pool, 'color', color), random, used)
        if (!card) return null
        used.add(card.id)
        picked.push(card)
      }
      return picked
    },
  },
  {
    id: 'four',
    pick: (pool, random) => {
      const options = [...kanjiToCards(pool)].filter(([, matched]) => matched.length >= 4)
      if (options.length === 0) return null
      const [, matched] = options[Math.floor(random() * options.length)]!
      return shuffle(matched, random).slice(0, 4)
    },
  },
  {
    id: 'sameMunicipality',
    pick: (pool, random) => {
      const byWard = new Map<string, PlaceCard[]>()
      for (const card of pool) {
        const list = byWard.get(card.municipality)
        if (list) list.push(card)
        else byWard.set(card.municipality, [card])
      }
      const options = [...byWard.values()].filter(
        (list) => list.length >= HAND_RULES.sameMunicipalityRequiredCards,
      )
      if (options.length === 0) return null
      const list = options[Math.floor(random() * options.length)]!
      return list.slice(0, HAND_RULES.sameMunicipalityRequiredCards + 2)
    },
  },
]

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/**
 * 周辺の候補（近い順）から、今回の盤面を抽選する。
 *   1. お題を 1 つ選び、その材料を必ず入れる
 *   2. いちばん近い駅を入れる（開始直後に動けるように）
 *   3. 残りは近い駅ほど選ばれやすい形で埋める
 */
export function buildDeck(
  candidates: readonly PlaceCard[],
  seed: number,
  size = DECK_RULES.size,
): PlaceCard[] {
  if (candidates.length <= size) return [...candidates]

  const random = seededRandom(seed)
  const picked = new Map<string, PlaceCard>()

  // 1. お題
  const feasible = THEMES.map((theme) => theme.pick(candidates, random)).filter(
    (cards): cards is PlaceCard[] => cards !== null && cards.length > 0,
  )
  if (feasible.length > 0) {
    for (const card of feasible[Math.floor(random() * feasible.length)]!) {
      picked.set(card.id, card)
    }
  }

  // 2. いちばん近い駅
  for (const card of candidates.slice(0, DECK_RULES.alwaysNearest)) picked.set(card.id, card)

  // 3. 残りを埋める。1/順位 のような急な重みだと「近い順に 20 駅」と同じ盤面に
  //    なってしまうため、なだらかな重みにしている。
  const pool = candidates
    .map((card, index) => ({ card, weight: 1 / Math.sqrt(index + 4) }))
    .filter((entry) => !picked.has(entry.card.id))

  while (picked.size < size && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0)
    let threshold = random() * total
    let chosen = pool.length - 1
    for (let i = 0; i < pool.length; i += 1) {
      threshold -= pool[i]!.weight
      if (threshold <= 0) {
        chosen = i
        break
      }
    }
    picked.set(pool[chosen]!.card.id, pool[chosen]!.card)
    pool.splice(chosen, 1)
  }

  return [...picked.values()].slice(0, size)
}

/** 盤面から手札を作れる枚数があるか */
export function isDeckPlayable(deck: readonly PlaceCard[]): boolean {
  return deck.length >= GAME_RULES.handSize
}
