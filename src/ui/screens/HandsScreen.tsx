/**
 * 役の画面。
 *
 * 「東」「3」「谷」を集めると何が起きるのかを、開始前に理解できるようにする。
 * 上段では、いまの盤面で実際に狙える役だけを示す（どこへ行けばよいかは示さない）。
 */
import { HAND_DEFINITIONS, HAND_RULES } from '@/config/gameConfig'
import { ANIMAL_SET, CATEGORY_LABEL, COLOR_SET, DIRECTION_SET, NATURE_SET } from '@/data/attributes'
import type { BoardChance } from '@/domain/board'
import type { AttributeCategory, HandId } from '@/domain/types'

/** 表示順（倍率の高い順） */
const HAND_ORDER: HandId[] = [
  'numberStraight',
  'mountainRiver',
  'compass',
  'four',
  'zoo',
  'color',
  'sameMunicipality',
  'three',
  'mixed',
  'pair',
]

const HAND_CONDITION: Record<HandId, string> = {
  numberStraight: `連続する数字を ${HAND_RULES.straightLength} 枚`,
  mountainRiver: `山 ${HAND_RULES.mountainRequiredCards} 枚と川 ${HAND_RULES.riverRequiredCards} 枚`,
  compass: '東・西・南・北をすべて',
  four: '同じ漢字を 4 枚',
  zoo: `異なる動物を ${HAND_RULES.zooRequiredKinds} 種類`,
  color: `異なる色を ${HAND_RULES.colorRequiredKinds} 種類`,
  sameMunicipality: `${HAND_RULES.sameMunicipalityRequiredCards} 枚すべて同じ区`,
  three: '同じ漢字を 3 枚',
  mixed: `異なる ${HAND_RULES.mixedRequiredCategories} 種類の属性で ${HAND_RULES.mixedCardsPerCategory} 枚ずつ`,
  pair: '同じ漢字を 2 枚',
}

const ATTRIBUTE_GUIDE: Array<{ category: AttributeCategory; sample: readonly string[]; note: string }> = [
  { category: 'number', sample: ['一', '二', '三', '四', '五'], note: '三軒茶屋 → 3' },
  { category: 'direction', sample: DIRECTION_SET, note: '北品川 → 北' },
  { category: 'color', sample: COLOR_SET, note: '目黒 → 黒' },
  { category: 'nature', sample: NATURE_SET, note: '渋谷 → 谷' },
  { category: 'animal', sample: ANIMAL_SET.slice(0, 6), note: '練馬 → 馬' },
]

interface Props {
  chances: BoardChance[]
  playing: boolean
}

export function HandsScreen({ chances, playing }: Props) {
  return (
    <div className="screen screen--scroll">
      <div className="page-head">
        <h1 className="page-head__title">役</h1>
        <p className="page-head__sub">地名の漢字をそろえると役になります</p>
      </div>

      <div className="section">
        <p className="section__label">
          {playing ? 'この盤面で狙える役' : 'この周辺で狙えそうな役'}
        </p>
        {chances.length === 0 ? (
          <p className="footnote">現在地が分かると、この盤面で狙える役が出ます</p>
        ) : (
          chances.slice(0, 3).map((chance) => (
            <div className="chance" key={chance.handId}>
              <div className="chance__head">
                <span className="chance__name">{chance.name}</span>
                <span className="chance__mult num">×{chance.multiplier.toFixed(1)}</span>
              </div>
              <p className="chance__note">{chance.note}</p>
            </div>
          ))
        )}
        <p className="footnote" style={{ marginTop: 12 }}>
          どの駅へ行くかは自分で決めてください
        </p>
      </div>

      <div className="section">
        <p className="section__label">役の一覧</p>
        {HAND_ORDER.map((handId) => (
          <div className="metarow" key={handId}>
            <span className="metarow__key">
              <b className="handname">{HAND_DEFINITIONS[handId].name}</b>
              <span className="handcond">{HAND_CONDITION[handId]}</span>
            </span>
            <span className="metarow__value num">×{HAND_DEFINITIONS[handId].multiplier.toFixed(1)}</span>
          </div>
        ))}
        <p className="footnote" style={{ marginTop: 12 }}>
          複数そろったときは、いちばん高い役に他の役の分が少し加算されます
        </p>
      </div>

      <div className="section">
        <p className="section__label">カードにつく属性</p>
        {ATTRIBUTE_GUIDE.map((guide) => (
          <div className="metarow" key={guide.category}>
            <span className="metarow__key">
              <b className="handname">{CATEGORY_LABEL[guide.category]}</b>
              <span className="handcond">{guide.note}</span>
            </span>
            <span className="metarow__value attrsample">{guide.sample.join(' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
