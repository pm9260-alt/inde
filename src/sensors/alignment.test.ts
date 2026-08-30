/**
 * 星ずれの測定と補正の検証。
 *
 * 「測った値を補正に入れれば、ずれが消える」ことを機械的に固定する。
 * 符号を 1 つ間違えるとずれが倍になるが、実機では「なぜか悪化した」と
 * しか見えない。ここで潰しておく。
 */
import { describe, expect, it } from 'vitest';

import {
  applyHeadingOffset,
  applyPitchOffset,
  cross,
  dot,
  enuFromAltAz,
  normalize,
  scale,
  sub,
  vec,
  quatFromMat3,
  type Quat,
} from '../astro/math';
import {
  CORRECTION_SANITY_LIMIT_DEG,
  isCorrectionSuspicious,
  measureAlignment,
  suggestedCorrection,
} from './alignment';
import { applyCorrection, NO_CORRECTION } from './corrections';

/** 背面カメラを (高度, 方位) に向けた姿勢。 */
const lookingAt = (altitudeDeg: number, azimuthDeg: number): Quat => {
  const forward = enuFromAltAz(altitudeDeg, azimuthDeg);
  const zAxis = scale(forward, -1);
  const worldUp = vec(0, 0, 1);
  const yAxis =
    normalize(sub(worldUp, scale(zAxis, dot(worldUp, zAxis)))) ??
    normalize(sub(vec(0, 1, 0), scale(zAxis, dot(vec(0, 1, 0), zAxis))))!;
  const xAxis = cross(yAxis, zAxis);
  return quatFromMat3([
    xAxis.x, yAxis.x, zAxis.x,
    xAxis.y, yAxis.y, zAxis.y,
    xAxis.z, yAxis.z, zAxis.z,
  ]);
};

describe('ずれの測定', () => {
  it('狙った先にちょうど星があればずれは 0', () => {
    const attitude = lookingAt(30, 120);
    const sample = measureAlignment(attitude, enuFromAltAz(30, 120));
    expect(sample.rightDeg).toBeCloseTo(0, 6);
    expect(sample.upDeg).toBeCloseTo(0, 6);
    expect(sample.azimuthDeg).toBeCloseTo(0, 6);
    expect(sample.altitudeDeg).toBeCloseTo(0, 6);
    expect(sample.totalDeg).toBeCloseTo(0, 6);
  });

  it('方位が大きい側にある星は画面の右に出る', () => {
    // 端末を水平に構えているので、方位のずれがそのまま画面の左右になる。
    const sample = measureAlignment(lookingAt(0, 100), enuFromAltAz(0, 105));
    expect(sample.rightDeg).toBeCloseTo(5, 4);
    expect(sample.azimuthDeg).toBeCloseTo(5, 4);
    expect(sample.upDeg).toBeCloseTo(0, 4);
  });

  it('高度が高い星は画面の上に出る', () => {
    const sample = measureAlignment(lookingAt(20, 100), enuFromAltAz(24, 100));
    expect(sample.upDeg).toBeCloseTo(4, 4);
    expect(sample.altitudeDeg).toBeCloseTo(4, 4);
    expect(sample.rightDeg).toBeCloseTo(0, 4);
  });

  it('方位が 0 度をまたいでも正しく畳まれる', () => {
    const sample = measureAlignment(lookingAt(0, 358), enuFromAltAz(0, 3));
    expect(sample.azimuthDeg).toBeCloseTo(5, 4);
  });

  it('端末を上に向けているときは、画面の左右と方位が一致しない', () => {
    // 高く傾けると、同じ方位差でも画面上の見かけは小さくなる。
    const sample = measureAlignment(lookingAt(60, 100), enuFromAltAz(60, 110));
    expect(sample.azimuthDeg).toBeCloseTo(10, 4);
    expect(Math.abs(sample.rightDeg)).toBeLessThan(10);
    expect(Math.abs(sample.rightDeg)).toBeGreaterThan(0);
  });
});

describe('補正の提案', () => {
  /** 補正を当てたあと、同じ星との差がどうなるかを測る。 */
  const residualAfterCorrection = (
    rawAttitude: Quat,
    starDirection: ReturnType<typeof enuFromAltAz>,
  ) => {
    const before = measureAlignment(rawAttitude, starDirection);
    const correction = suggestedCorrection(NO_CORRECTION, before);
    const corrected = applyCorrection(rawAttitude, correction);
    return { before, after: measureAlignment(corrected, starDirection), correction };
  };

  it('方位のずれを打ち消す', () => {
    const { before, after } = residualAfterCorrection(lookingAt(0, 100), enuFromAltAz(0, 106));
    expect(before.azimuthDeg).toBeCloseTo(6, 4);
    expect(Math.abs(after.azimuthDeg)).toBeLessThan(0.01);
    expect(after.totalDeg).toBeLessThan(0.01);
  });

  it('仰角のずれを打ち消す', () => {
    const { before, after } = residualAfterCorrection(lookingAt(25, 90), enuFromAltAz(27.5, 90));
    expect(before.altitudeDeg).toBeCloseTo(2.5, 4);
    expect(Math.abs(after.altitudeDeg)).toBeLessThan(0.01);
  });

  it('方位と仰角が同時にずれていても打ち消す', () => {
    const { after } = residualAfterCorrection(lookingAt(20, 200), enuFromAltAz(21.5, 204));
    expect(after.totalDeg).toBeLessThan(0.05);
  });

  it('補正を当てて悪化しない（符号の取り違えがない）', () => {
    // 符号を逆にすると、ずれはちょうど倍になる。それが起きていないこと。
    for (const [alt, az, dAlt, dAz] of [
      [0, 0, 1, 3],
      [40, 180, -2, -5],
      [15, 270, 0.5, 2],
      [65, 45, -1, 4],
    ]) {
      const { before, after } = residualAfterCorrection(
        lookingAt(alt, az),
        enuFromAltAz(alt + dAlt, az + dAz),
      );
      expect(after.totalDeg).toBeLessThan(before.totalDeg * 0.1);
    }
  });

  it('もとの補正値に足し込む（置き換えない）', () => {
    const current = { declinationDeg: -7.5, manualHeadingDeg: 1, manualPitchDeg: 0.5 };
    const sample = measureAlignment(lookingAt(0, 100), enuFromAltAz(0, 103));
    const next = suggestedCorrection(current, sample);
    expect(next.declinationDeg).toBe(-7.5);
    expect(next.manualHeadingDeg).toBeCloseTo(1 + 3, 4);
    expect(next.manualPitchDeg).toBeCloseTo(0.5, 4);
  });

  it('すでに補正が入っている状態からでも、残りのずれを打ち消す', () => {
    const current = { declinationDeg: 0, manualHeadingDeg: 2, manualPitchDeg: -1 };
    const raw = lookingAt(30, 150);
    const star = enuFromAltAz(31, 155);
    const corrected = applyCorrection(raw, current);
    const sample = measureAlignment(corrected, star);
    const next = suggestedCorrection(current, sample);
    const after = measureAlignment(applyCorrection(raw, next), star);
    expect(after.totalDeg).toBeLessThan(0.05);
  });
});

describe('補正で隠してはいけない大きさ', () => {
  it('数度までのずれは補正の範囲', () => {
    const sample = measureAlignment(lookingAt(0, 100), enuFromAltAz(0, 103));
    expect(isCorrectionSuspicious(sample)).toBe(false);
  });

  it('大きなずれは補正ではなく原因を疑う', () => {
    const sample = measureAlignment(lookingAt(0, 100), enuFromAltAz(0, 120));
    expect(isCorrectionSuspicious(sample)).toBe(true);
  });

  it('高度側だけが大きくても疑う', () => {
    const sample = measureAlignment(lookingAt(20, 100), enuFromAltAz(35, 100));
    expect(isCorrectionSuspicious(sample)).toBe(true);
  });

  it('閾値は光軸の傾きや地磁気の偏りでは説明できない大きさ', () => {
    expect(CORRECTION_SANITY_LIMIT_DEG).toBeGreaterThan(3);
    expect(CORRECTION_SANITY_LIMIT_DEG).toBeLessThan(20);
  });
});

describe('補正の適用そのもの', () => {
  it('方位補正は報告される方位を増やす', () => {
    const attitude = applyHeadingOffset(lookingAt(0, 100), 5);
    const sample = measureAlignment(attitude, enuFromAltAz(0, 105));
    expect(sample.azimuthDeg).toBeCloseTo(0, 4);
  });

  it('仰角補正は狙いを上げる', () => {
    const attitude = applyPitchOffset(lookingAt(20, 100), 3);
    const sample = measureAlignment(attitude, enuFromAltAz(23, 100));
    expect(sample.altitudeDeg).toBeCloseTo(0, 4);
  });

  it('補正なしなら姿勢は変わらない', () => {
    const attitude = lookingAt(10, 10);
    expect(applyCorrection(attitude, NO_CORRECTION)).toBe(attitude);
  });
});
