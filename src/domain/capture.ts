/**
 * カード取得の可否判定。GPS 誤差を考慮する。
 *
 * 実距離から「GPS 誤差の許容分」を引いた値が取得距離以内なら取得できる。
 * ただし精度があまりに悪いときは、誤取得を防ぐため取得自体を止める。
 */
import { LOCATION_RULES } from '@/config/gameConfig'

export type CaptureBlockReason =
  | 'no-location'
  | 'poor-accuracy'
  | 'too-far'
  | 'already-captured'
  | 'hand-full'
  | 'not-playing'

export interface CaptureEligibility {
  canCapture: boolean
  reason: CaptureBlockReason | null
  /** GPS 誤差を差し引いたあとの実効距離 (m) */
  effectiveDistance: number
  /** あと何 m 近づけばよいか（0 なら圏内） */
  metersToGo: number
}

export function evaluateCaptureEligibility(params: {
  distanceMeters: number | null
  accuracyMeters: number | null
  alreadyCaptured: boolean
  handFull: boolean
  playing: boolean
}): CaptureEligibility {
  const { distanceMeters, accuracyMeters, alreadyCaptured, handFull, playing } = params

  const allowance = Math.min(accuracyMeters ?? 0, LOCATION_RULES.accuracyAllowanceMaxMeters)
  const effectiveDistance =
    distanceMeters === null ? Number.POSITIVE_INFINITY : Math.max(0, distanceMeters - allowance)
  const metersToGo = Math.max(0, effectiveDistance - LOCATION_RULES.captureRadiusMeters)

  const blocked = (reason: CaptureBlockReason): CaptureEligibility => ({
    canCapture: false,
    reason,
    effectiveDistance,
    metersToGo,
  })

  if (alreadyCaptured) return blocked('already-captured')
  if (!playing) return blocked('not-playing')
  if (handFull) return blocked('hand-full')
  if (distanceMeters === null || accuracyMeters === null) return blocked('no-location')
  if (accuracyMeters > LOCATION_RULES.unusableAccuracyMeters) return blocked('poor-accuracy')
  if (metersToGo > 0) return blocked('too-far')

  return { canCapture: true, reason: null, effectiveDistance, metersToGo }
}

/** 取得できない理由の 1 行説明 */
export function captureBlockMessage(
  reason: CaptureBlockReason | null,
  metersToGo: number,
): string {
  switch (reason) {
    case 'already-captured':
      return 'このカードは取得済みです'
    case 'not-playing':
      return 'チャレンジを開始すると取得できます'
    case 'hand-full':
      return '手札がすでに 5 枚です'
    case 'no-location':
      return '現在地が分からないため取得できません'
    case 'poor-accuracy':
      return 'GPS の精度が低いため取得できません'
    case 'too-far':
      return `あと ${Math.round(metersToGo)}m 近づくと取得できます`
    default:
      return ''
  }
}
