import { describe, expect, it } from 'vitest'
import { LOCATION_RULES } from '@/config/gameConfig'
import { captureBlockMessage, evaluateCaptureEligibility } from '@/domain/capture'
import { distanceMeters, formatDistance, offsetLatLng } from '@/domain/geo'

const base = {
  alreadyCaptured: false,
  handFull: false,
  playing: true,
}

describe('取得可否', () => {
  it('取得距離の内側なら取得できる', () => {
    const result = evaluateCaptureEligibility({ ...base, distanceMeters: 50, accuracyMeters: 10 })
    expect(result.canCapture).toBe(true)
    expect(result.metersToGo).toBe(0)
  })

  it('遠すぎるときは、あと何 m かを返す', () => {
    const result = evaluateCaptureEligibility({ ...base, distanceMeters: 420, accuracyMeters: 10 })
    expect(result.canCapture).toBe(false)
    expect(result.reason).toBe('too-far')
    expect(Math.round(result.metersToGo)).toBe(
      420 - 10 - LOCATION_RULES.captureRadiusMeters,
    )
  })

  it('GPS 誤差の分だけ緩める', () => {
    // 実距離 130m・誤差 40m → 実効 90m で取得できる
    expect(
      evaluateCaptureEligibility({ ...base, distanceMeters: 130, accuracyMeters: 40 }).canCapture,
    ).toBe(true)
  })

  it('誤差の許容には上限がある', () => {
    const overAllowance = LOCATION_RULES.captureRadiusMeters +
      LOCATION_RULES.accuracyAllowanceMaxMeters + 30
    expect(
      evaluateCaptureEligibility({
        ...base,
        distanceMeters: overAllowance,
        accuracyMeters: 150,
      }).canCapture,
    ).toBe(false)
  })

  it('精度が悪すぎるときは取得を止める', () => {
    const result = evaluateCaptureEligibility({
      ...base,
      distanceMeters: 10,
      accuracyMeters: LOCATION_RULES.unusableAccuracyMeters + 1,
    })
    expect(result.canCapture).toBe(false)
    expect(result.reason).toBe('poor-accuracy')
  })

  it('現在地が無いときは取得できない', () => {
    expect(
      evaluateCaptureEligibility({ ...base, distanceMeters: null, accuracyMeters: null }).reason,
    ).toBe('no-location')
  })

  it('取得済み・手札いっぱい・ゲーム外はそれぞれの理由を返す', () => {
    expect(
      evaluateCaptureEligibility({ ...base, distanceMeters: 5, accuracyMeters: 5, alreadyCaptured: true })
        .reason,
    ).toBe('already-captured')
    expect(
      evaluateCaptureEligibility({ ...base, distanceMeters: 5, accuracyMeters: 5, handFull: true }).reason,
    ).toBe('hand-full')
    expect(
      evaluateCaptureEligibility({ ...base, distanceMeters: 5, accuracyMeters: 5, playing: false }).reason,
    ).toBe('not-playing')
  })

  it('案内文が 1 行で返る', () => {
    expect(captureBlockMessage('too-far', 312)).toBe('あと 312m 近づくと取得できます')
    expect(captureBlockMessage('already-captured', 0)).not.toContain('\n')
    expect(captureBlockMessage(null, 0)).toBe('')
  })
})

describe('距離計算', () => {
  it('同じ地点なら 0m', () => {
    expect(distanceMeters({ lat: 35.6, lng: 139.7 }, { lat: 35.6, lng: 139.7 })).toBe(0)
  })

  it('東京駅と品川駅はおよそ 6.4km', () => {
    const value = distanceMeters({ lat: 35.6812, lng: 139.7671 }, { lat: 35.6285, lng: 139.7387 })
    expect(value).toBeGreaterThan(6000)
    expect(value).toBeLessThan(7000)
  })

  it('指定した距離だけ動かせる', () => {
    const origin = { lat: 35.6812, lng: 139.7671 }
    const moved = offsetLatLng(origin, 250, 90)
    expect(distanceMeters(origin, moved)).toBeCloseTo(250, 0)
  })

  it('表示形式', () => {
    expect(formatDistance(420)).toBe('420m')
    expect(formatDistance(1500)).toBe('1.5km')
  })
})
