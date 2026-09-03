/**
 * 街ポーカー — ゲームバランス設定
 *
 * ★ 得点・役・距離・時間の調整はすべてこのファイルだけで完結する。
 *   数字を書き換えれば、他のコードに触れずにバランスを変えられる。
 */
import type { HandId } from '@/domain/types'

/* ------------------------------------------------------------------ *
 * 1. ゲーム進行
 * ------------------------------------------------------------------ */
export const GAME_RULES = {
  /** 制限時間（分） */
  durationMinutes: 30,
  /** 手札の最大枚数 */
  handSize: 5,
} as const

/* ------------------------------------------------------------------ *
 * 2. 位置・距離
 * ------------------------------------------------------------------ */
export const LOCATION_RULES = {
  /** カードを取得できる距離 (m) */
  captureRadiusMeters: 100,
  /**
   * GPS 誤差の許容。measuredAccuracy をこの上限まで捕捉判定に足す。
   * 例) 実距離 130m・GPS 誤差 40m → 130 - 40 = 90m ≦ 100m で取得可能。
   */
  accuracyAllowanceMaxMeters: 50,
  /** これより精度が悪いときは「GPS の精度が低い」と案内する (m) */
  poorAccuracyThresholdMeters: 60,
  /** これより精度が悪いと取得自体を止める (m) */
  unusableAccuracyMeters: 200,
  /** マップに表示する候補地点の範囲 (m) */
  nearbyRadiusMeters: 3000,
  /** マップに一度に表示する最大件数（描画負荷対策） */
  maxNearbyMarkers: 60,
  /** 移動距離に加算する最小移動量 (m)。GPS の揺れを無視するため。 */
  minMovementStepMeters: 8,
  /** 移動距離の計算に使う最低限の位置精度 (m) */
  movementMaxAccuracyMeters: 120,
} as const

/* ------------------------------------------------------------------ *
 * 3. カード基礎点
 *    基礎点 = base + 属性ごとの加点（同カテゴリ内は最大 maxPerCategory 個まで）
 * ------------------------------------------------------------------ */
export const CARD_POINTS = {
  base: 300,
  perAttribute: {
    number: 100,
    direction: 200,
    color: 150,
    nature: 100,
    animal: 250,
  },
  /** 1 カテゴリあたりの加点対象上限 */
  maxPerCategory: 2,
  /** 基礎点の上限 */
  cap: 1200,
} as const

/* ------------------------------------------------------------------ *
 * 4. 役
 * ------------------------------------------------------------------ */

/**
 * ペア／スリー／フォーカードの「対象漢字」の決め方。
 *  - 'all'        : 地名に含まれるすべての漢字が対象（新宿＋新橋＝ペア「新」が成立）
 *  - 'dictionary' : 属性辞書に載っている漢字だけが対象
 * 街を歩くルート選びの幅が広い 'all' を既定にしている。
 */
export const TARGET_KANJI_MODE: 'all' | 'dictionary' = 'all'

export const HAND_RULES = {
  /** ⑥ カラー：異なる色属性が何種類そろえば成立するか */
  colorRequiredKinds: 3,
  /** ⑦ 動物園：異なる動物属性が何種類そろえば成立するか */
  zooRequiredKinds: 3,
  /** ⑧ 山川：山属性の必要枚数 */
  mountainRequiredCards: 3,
  /** ⑧ 山川：川属性の必要枚数 */
  riverRequiredCards: 2,
  /** ⑤ ナンバーストレート：連続させる長さ */
  straightLength: 5,
  /** ⑨ 同一区：必要枚数 */
  sameMunicipalityRequiredCards: 5,
  /** ⑩ ミックス：異なるカテゴリ数 */
  mixedRequiredCategories: 3,
  /** ⑩ ミックス：各カテゴリで必要なカード枚数 */
  mixedCardsPerCategory: 2,
} as const

/** 役の倍率と表示名。並び順は結果画面での表示順。 */
export const HAND_DEFINITIONS: Record<HandId, { name: string; multiplier: number; summary: string }> = {
  numberStraight: {
    name: 'ナンバーストレート',
    multiplier: 5.0,
    summary: '連続する数字を 5 枚そろえる',
  },
  mountainRiver: { name: '山川', multiplier: 4.5, summary: '山 3 枚と川 2 枚' },
  compass: { name: '東西南北', multiplier: 4.0, summary: '東・西・南・北をすべてそろえる' },
  four: { name: 'フォーカード', multiplier: 4.0, summary: '同じ漢字が 4 枚' },
  zoo: { name: '動物園', multiplier: 3.5, summary: '異なる動物が 3 種類' },
  color: { name: 'カラー', multiplier: 3.0, summary: '異なる色が 3 種類' },
  sameMunicipality: { name: '同一区', multiplier: 3.0, summary: '5 枚すべて同じ区' },
  three: { name: 'スリー', multiplier: 2.5, summary: '同じ漢字が 3 枚' },
  mixed: { name: 'ミックス', multiplier: 2.0, summary: '異なる 3 カテゴリで 2 枚ずつ' },
  pair: { name: 'ペア', multiplier: 1.5, summary: '同じ漢字が 2 枚' },
}

/* ------------------------------------------------------------------ *
 * 5. スコア計算
 * ------------------------------------------------------------------ */
export const SCORING = {
  /**
   * 役が複数成立したときの扱い。
   *   最終倍率 = 最大役の倍率 + Σ (それ以外の役の倍率 - 1) × secondaryHandWeight
   * 例) 東西南北 ×4.0 と ペア ×1.5 が成立
   *     → 4.0 + (1.5 - 1) × 0.5 = 4.25 倍
   */
  secondaryHandWeight: 0.5,
  /** 役がひとつも成立しなかったときの倍率 */
  noHandMultiplier: 1.0,
  /** 手札が 5 枚に満たないまま時間切れになったときの倍率係数 */
  incompleteHandPenalty: 0.8,
} as const

/* ------------------------------------------------------------------ *
 * 6. 役予告
 * ------------------------------------------------------------------ */
export const HINT_RULES = {
  /** 同時に表示する予告の最大件数 */
  maxHints: 3,
} as const
