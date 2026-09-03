/**
 * 街ポーカー — ドメイン型定義
 *
 * ここに UI やブラウザ API への依存を持ち込まないこと。
 * ゲームルールを iOS ネイティブへ移植するときに、このディレクトリ
 * (src/domain) と src/config だけを読み替えれば済む状態を保つ。
 */

/** 属性カテゴリ。辞書 (src/data/attributes.ts) を増やせば拡張できる。 */
export type AttributeCategory = 'number' | 'direction' | 'color' | 'nature' | 'animal'

export const ATTRIBUTE_CATEGORIES: readonly AttributeCategory[] = [
  'number',
  'direction',
  'color',
  'nature',
  'animal',
] as const

/** 1 つの属性。value は「北」「三」のような表示用の値。 */
export interface Attribute {
  category: AttributeCategory
  /** 表示・判定に使う値。数字属性のみ numeric を併せ持つ。 */
  value: string
  /** 属性の由来となった地名中の漢字 */
  kanji: string
  /** category === 'number' のときだけ入る算用数字 */
  numeric?: number
}

/** 地名カードの元データ（データソースから読み込む生の地点情報） */
export interface PlaceSource {
  id: string
  name: string
  /** 読み（任意） */
  reading?: string
  prefecture: string
  municipality: string
  lat: number
  lng: number
  /** 路線名など。表示の補助にのみ使い、役判定には使わない。 */
  lines?: string[]
}

/** 属性を解決したあとの、ゲーム中に使うカード */
export interface PlaceCard extends PlaceSource {
  /** 地名に含まれる漢字（重複を保つ） */
  kanji: string[]
  attributes: Attribute[]
  /** カード基礎点 */
  basePoints: number
}

/** 手札に入ったカード（取得の記録つき） */
export interface CapturedCard {
  card: PlaceCard
  capturedAt: number
  /** 取得時の現在地と対象地点との距離 (m) */
  distanceAtCapture: number
}

/** 成立した役 */
export interface HandResult {
  id: HandId
  name: string
  multiplier: number
  /** 「三 が 3 枚」のような、成立内容の 1 行説明 */
  detail: string
  /** 役の成立に使われたカード ID */
  cardIds: string[]
}

export type HandId =
  | 'pair'
  | 'three'
  | 'four'
  | 'compass'
  | 'numberStraight'
  | 'color'
  | 'zoo'
  | 'mountainRiver'
  | 'sameMunicipality'
  | 'mixed'

/** スコア計算の内訳 */
export interface ScoreBreakdown {
  cardTotal: number
  hands: HandResult[]
  bestHand: HandResult | null
  /** 最大役の倍率 */
  baseMultiplier: number
  /** 最大役以外の役による加算分 */
  bonusMultiplier: number
  /** baseMultiplier + bonusMultiplier */
  totalMultiplier: number
  finalScore: number
}

/** 役予告（あと何が来れば成立するか） */
export interface HandHint {
  handId: HandId
  handName: string
  multiplier: number
  /** 「あと『北』で東西南北」の本文 */
  text: string
  /** 成立まであと何枚必要か */
  remaining: number
}
