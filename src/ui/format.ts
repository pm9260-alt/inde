/** 表示用の文字列づくり */
import { CATEGORY_LABEL } from '@/data/attributes'
import type { PlaceCard } from '@/domain/types'

/** マーカーに出す「簡単な属性」1 つ分 */
export function primaryAttributeLabel(card: PlaceCard): string {
  const attribute = card.attributes[0]
  if (!attribute) return ''
  return attribute.category === 'number' ? attribute.value : attribute.kanji
}

/** カード詳細に出す属性の一覧（「数字 3」「方角 北」） */
export function attributeLabels(card: PlaceCard): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const attribute of card.attributes) {
    const label = `${CATEGORY_LABEL[attribute.category]} ${
      attribute.category === 'number' ? attribute.value : attribute.kanji
    }`
    if (seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

/** 秒 → 「12:34」 */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** 秒 → 「28分12秒」 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
}

/** 日時 → 「9月4日」 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}
