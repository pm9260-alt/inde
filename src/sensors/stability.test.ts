import { describe, expect, it } from 'vitest';

import {
  cross,
  dot,
  enuFromAltAz,
  normalize,
  quatFromMat3,
  scale,
  sub,
  vec,
  type Quat,
} from '../astro/math';
import { EMPTY_STABILITY, measureDrift, StabilityWindow } from './stability';

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

describe('ゆらぎ', () => {
  it('サンプルが足りなければ 0', () => {
    const window = new StabilityWindow();
    expect(window.summary()).toEqual(EMPTY_STABILITY);
    window.push(lookingAt(10, 10), 0);
    expect(window.summary()).toEqual(EMPTY_STABILITY);
  });

  it('動かなければ振れ幅は 0', () => {
    const window = new StabilityWindow();
    for (let i = 0; i < 30; i += 1) window.push(lookingAt(20, 100), i * 33);
    const summary = window.summary();
    expect(summary.azimuthSpreadDeg).toBeCloseTo(0, 6);
    expect(summary.altitudeSpreadDeg).toBeCloseTo(0, 6);
    expect(summary.sampleCount).toBe(30);
  });

  it('揺れた分が振れ幅として出る', () => {
    const window = new StabilityWindow();
    for (let i = 0; i < 30; i += 1) {
      window.push(lookingAt(20 + (i % 2 === 0 ? 0.2 : -0.2), 100 + (i % 2 === 0 ? 0.5 : -0.5)), i * 33);
    }
    const summary = window.summary();
    expect(summary.azimuthSpreadDeg).toBeCloseTo(1.0, 1);
    expect(summary.altitudeSpreadDeg).toBeCloseTo(0.4, 1);
  });

  it('方位 0 度をまたいでも振れ幅が跳ね上がらない', () => {
    const window = new StabilityWindow();
    for (const azimuth of [359.5, 0.2, 359.8, 0.5, 0.0]) {
      window.push(lookingAt(10, azimuth), 0);
    }
    expect(window.summary().azimuthSpreadDeg).toBeLessThan(2);
  });

  it('窓から出た古いサンプルは落ちる', () => {
    const window = new StabilityWindow(1000);
    window.push(lookingAt(10, 0), 0);
    window.push(lookingAt(10, 50), 500);
    window.push(lookingAt(10, 10), 2000);
    window.push(lookingAt(10, 11), 2100);
    const summary = window.summary();
    expect(summary.sampleCount).toBe(2);
    expect(summary.azimuthSpreadDeg).toBeCloseTo(1, 4);
  });

  it('clear で空になる', () => {
    const window = new StabilityWindow();
    for (let i = 0; i < 10; i += 1) window.push(lookingAt(5, 5), i * 10);
    window.clear();
    expect(window.summary()).toEqual(EMPTY_STABILITY);
  });
});

describe('ドリフト', () => {
  const reference = { attitude: lookingAt(30, 100), at: 0 };

  it('動いていなければ 0', () => {
    const drift = measureDrift(reference, lookingAt(30, 100), 60_000);
    expect(drift.azimuthDeg).toBeCloseTo(0, 6);
    expect(drift.altitudeDeg).toBeCloseTo(0, 6);
    expect(drift.totalDeg).toBeCloseTo(0, 6);
  });

  it('方位の流れを度で出す', () => {
    const drift = measureDrift(reference, lookingAt(30, 102.5), 60_000);
    expect(drift.azimuthDeg).toBeCloseTo(2.5, 4);
    expect(drift.elapsedSeconds).toBeCloseTo(60, 4);
    expect(drift.azimuthPerMinute).toBeCloseTo(2.5, 3);
  });

  it('高度の流れも出る', () => {
    const drift = measureDrift(reference, lookingAt(31.2, 100), 30_000);
    expect(drift.altitudeDeg).toBeCloseTo(1.2, 4);
  });

  it('方位 0 度をまたいでも畳まれる', () => {
    const across = { attitude: lookingAt(10, 359), at: 0 };
    expect(measureDrift(across, lookingAt(10, 2), 60_000).azimuthDeg).toBeCloseTo(3, 4);
  });

  it('経過が短いうちは速度を出さない', () => {
    expect(measureDrift(reference, lookingAt(30, 101), 5000).azimuthPerMinute).toBeNull();
    expect(measureDrift(reference, lookingAt(30, 101), 12_000).azimuthPerMinute).not.toBeNull();
  });
});
