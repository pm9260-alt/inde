/**
 * 役予告。
 *
 * 「あと『北』で東西南北」のように、残り枚数で狙える役を提示する。
 * どこへ行けばよいかまでは示さない（ルートを考えるのはプレイヤーの仕事）。
 */
import { GAME_RULES, HAND_DEFINITIONS, HAND_RULES, HINT_RULES } from '@/config/gameConfig'
import { ANIMAL_SET, COLOR_SET, DIRECTION_SET } from '@/data/attributes'
import { evaluateHands, kanjiToCards, valuesOf } from '@/domain/hands'
import type { HandHint, HandId, PlaceCard } from '@/domain/types'

function makeHint(handId: HandId, text: string, remaining: number): HandHint {
  const def = HAND_DEFINITIONS[handId]
  return { handId, handName: def.name, multiplier: def.multiplier, text, remaining }
}

function countCardsWith(cards: readonly PlaceCard[], predicate: (card: PlaceCard) => boolean) {
  return cards.filter(predicate).length
}

export interface HintOptions {
  /**
   * 残り何枚で考えるか。
   * 省略すると手札の残り枠。結果画面の「惜しかった役」では 1 を渡す。
   */
  slotsLeft?: number
  /** 1 枚も取っていない状態でも出すか（既定は出さない） */
  allowEmptyHand?: boolean
}

export function buildHandHints(
  cards: readonly PlaceCard[],
  options: HintOptions = {},
): HandHint[] {
  const slotsLeft = options.slotsLeft ?? GAME_RULES.handSize - cards.length
  if (slotsLeft <= 0) return []
  // 1 枚も取っていない時点では、すべての役が候補になってしまい助けにならない。
  // ルートを考えるのはプレイヤーの仕事なので、最初の 1 枚を取ってから出す。
  if (cards.length === 0 && !options.allowEmptyHand) return []

  const completed = new Set(evaluateHands(cards).map((hand) => hand.id))
  const hints: HandHint[] = []

  /* ④ 東西南北 ------------------------------------------------------ */
  if (!completed.has('compass')) {
    const missing = DIRECTION_SET.filter(
      (direction) => !cards.some((card) => valuesOf(card, 'direction').includes(direction)),
    )
    if (missing.length > 0 && missing.length <= slotsLeft) {
      hints.push(
        makeHint('compass', `あと「${missing.join('」「')}」で東西南北`, missing.length),
      )
    }
  }

  /* ⑤ ナンバーストレート -------------------------------------------- */
  if (!completed.has('numberStraight')) {
    const length = HAND_RULES.straightLength
    let best: { missing: string[] } | null = null
    for (let start = 1; start + length - 1 <= 10; start += 1) {
      const missing: string[] = []
      for (let offset = 0; offset < length; offset += 1) {
        const target = String(start + offset)
        if (!cards.some((card) => valuesOf(card, 'number').includes(target))) missing.push(target)
      }
      if (missing.length === 0) continue
      if (!best || missing.length < best.missing.length) best = { missing }
    }
    if (best && best.missing.length <= slotsLeft) {
      const kanjiOf = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      const label = best.missing.map((n) => kanjiOf[Number(n)] ?? n).join('」「')
      hints.push(makeHint('numberStraight', `あと「${label}」でナンバーストレート`, best.missing.length))
    }
  }

  /* ①②③ ペア／スリー／フォーカード ---------------------------------- */
  if (!completed.has('four')) {
    let best: { kanji: string; count: number } | null = null
    for (const [kanji, matched] of kanjiToCards(cards)) {
      if (!best || matched.length > best.count) best = { kanji, count: matched.length }
    }
    if (best) {
      const nextTier: { id: HandId; need: number } | null =
        best.count >= 3 ? { id: 'four', need: 4 } : best.count >= 2 ? { id: 'three', need: 3 } : { id: 'pair', need: 2 }
      const remaining = nextTier.need - best.count
      if (remaining > 0 && remaining <= slotsLeft) {
        hints.push(
          makeHint(
            nextTier.id,
            `あと ${remaining} 枚「${best.kanji}」で${HAND_DEFINITIONS[nextTier.id].name}`,
            remaining,
          ),
        )
      }
    }
  }

  /* ⑥ カラー・⑦ 動物園 --------------------------------------------- */
  const distinctHints: Array<[HandId, readonly string[], number, string]> = [
    ['color', COLOR_SET, HAND_RULES.colorRequiredKinds, '色'],
    ['zoo', ANIMAL_SET, HAND_RULES.zooRequiredKinds, '動物'],
  ]
  for (const [handId, universe, required, label] of distinctHints) {
    if (completed.has(handId)) continue
    const category = handId === 'color' ? 'color' : 'animal'
    const owned = new Set(cards.flatMap((card) => valuesOf(card, category)))
    const remaining = required - owned.size
    if (remaining > 0 && remaining <= slotsLeft && owned.size > 0) {
      const candidates = universe.filter((value) => !owned.has(value))
      hints.push(
        makeHint(
          handId,
          `あと ${remaining} 種類の${label}（${candidates.slice(0, 3).join('・')} など）で${HAND_DEFINITIONS[handId].name}`,
          remaining,
        ),
      )
    }
  }

  /* ⑧ 山川 --------------------------------------------------------- */
  if (!completed.has('mountainRiver')) {
    const mountain = countCardsWith(cards, (card) => valuesOf(card, 'nature').includes('山'))
    const river = countCardsWith(cards, (card) => valuesOf(card, 'nature').includes('川'))
    const needMountain = Math.max(0, HAND_RULES.mountainRequiredCards - mountain)
    const needRiver = Math.max(0, HAND_RULES.riverRequiredCards - river)
    const remaining = needMountain + needRiver
    if (remaining > 0 && remaining <= slotsLeft && mountain + river > 0) {
      const parts: string[] = []
      if (needMountain > 0) parts.push(`「山」${needMountain} 枚`)
      if (needRiver > 0) parts.push(`「川」${needRiver} 枚`)
      hints.push(makeHint('mountainRiver', `あと ${parts.join(' と ')} で山川`, remaining))
    }
  }

  /* ⑨ 同一区 ------------------------------------------------------- */
  if (!completed.has('sameMunicipality') && cards.length > 0) {
    const first = cards[0]!.municipality
    if (cards.every((card) => card.municipality === first)) {
      const remaining = HAND_RULES.sameMunicipalityRequiredCards - cards.length
      if (remaining > 0 && remaining <= slotsLeft) {
        hints.push(makeHint('sameMunicipality', `${first}であと ${remaining} 枚で同一区`, remaining))
      }
    }
  }

  return hints
    .sort((a, b) => a.remaining - b.remaining || b.multiplier - a.multiplier)
    .slice(0, HINT_RULES.maxHints)
}

/**
 * 「あと 1 枚で成立していた役」。結果画面で次の動機づけに使う。
 * 成立しなかった役のうち、あと 1 枚で届いていたものを 1 つだけ返す。
 */
export function findNearMiss(cards: readonly PlaceCard[]): HandHint | null {
  const hints = buildHandHints(cards, { slotsLeft: 1 })
  const closest = hints.filter((hint) => hint.remaining === 1)
  if (closest.length === 0) return null
  return closest.reduce((best, hint) => (hint.multiplier > best.multiplier ? hint : best))
}
