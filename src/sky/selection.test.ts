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
  altitudeOf,
  azimuthOf,
  type Quat,
} from '../astro/math';
import { computeSkySnapshot } from '../astro/sky';
import { asterismById } from '../data/constellations';
import { aimedAsterism, asterismCenter, asterismRadius } from './selection';

const TOKYO = { latitude: 35.6812, longitude: 139.7671, elevation: 40 };
/** 東京で 2026 年 1 月 15 日 21 時ごろ。オリオン座が南東の空にある。 */
const WINTER_NIGHT = new Date('2026-01-15T12:00:00Z');

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

describe('星座の中心と広がり', () => {
  const snapshot = computeSkySnapshot(TOKYO, WINTER_NIGHT);

  it('中心は単位ベクトル', () => {
    const center = asterismCenter(snapshot, asterismById('orion'));
    expect(Math.hypot(center.x, center.y, center.z)).toBeCloseTo(1, 9);
  });

  it('オリオン座の広がりは 10 度前後', () => {
    const radius = asterismRadius(snapshot, asterismById('orion'));
    expect(radius).toBeGreaterThan(6);
    expect(radius).toBeLessThan(14);
  });

  it('夏の大三角はオリオン座よりずっと広い', () => {
    expect(asterismRadius(snapshot, asterismById('summer-triangle'))).toBeGreaterThan(
      asterismRadius(snapshot, asterismById('orion')),
    );
  });
});

describe('向けている星座の判定', () => {
  const snapshot = computeSkySnapshot(TOKYO, WINTER_NIGHT);

  it('星座の中心へ向ければその星座が選ばれる', () => {
    for (const id of ['orion', 'cassiopeia', 'big-dipper']) {
      const center = asterismCenter(snapshot, asterismById(id));
      const attitude = lookingAt(altitudeOf(center), azimuthOf(center));
      expect(aimedAsterism(snapshot, attitude, 20)?.asterism.id).toBe(id);
    }
  });

  it('何も無い方向を向ければ何も選ばれない', () => {
    // 冬の東京の真夜中、真西の低空にはこの 5 つのどれも無い。
    const attitude = lookingAt(5, 270);
    const aimed = aimedAsterism(snapshot, attitude, 15);
    if (aimed) {
      // 拾ってしまう場合でも、少なくとも中心から大きく外れていること。
      expect(aimed.offsetDeg).toBeGreaterThan(15);
    }
  });

  it('地面の方向を向ければ何も選ばれない', () => {
    expect(aimedAsterism(snapshot, lookingAt(-80, 0), 20)).toBeNull();
  });

  it('2 つの星座の中間では、近いほうが選ばれる', () => {
    const orion = asterismCenter(snapshot, asterismById('orion'));
    const attitude = lookingAt(altitudeOf(orion) + 3, azimuthOf(orion));
    const aimed = aimedAsterism(snapshot, attitude, 25);
    expect(aimed?.asterism.id).toBe('orion');
    expect(aimed?.offsetDeg).toBeLessThan(5);
  });

  it('地平線下の星座は候補から外れる', () => {
    // 冬の夜、さそり座は地平線の下にいる。
    const scorpius = asterismCenter(snapshot, asterismById('scorpius'));
    expect(scorpius.z).toBeLessThan(0);
    const attitude = lookingAt(altitudeOf(scorpius), azimuthOf(scorpius));
    expect(aimedAsterism(snapshot, attitude, 25)?.asterism.id).not.toBe('scorpius');
  });

  it('夏の夜にはさそり座が選べる', () => {
    // 2026 年 7 月 20 日 21 時 JST ごろ。
    const summer = computeSkySnapshot(TOKYO, new Date('2026-07-20T12:00:00Z'));
    const center = asterismCenter(summer, asterismById('scorpius'));
    expect(center.z).toBeGreaterThan(0);
    const attitude = lookingAt(altitudeOf(center), azimuthOf(center));
    expect(aimedAsterism(summer, attitude, 20)?.asterism.id).toBe('scorpius');
  });

  it('許容角を狭めると外れやすくなる', () => {
    const center = asterismCenter(snapshot, asterismById('cassiopeia'));
    const attitude = lookingAt(altitudeOf(center) + 20, azimuthOf(center));
    expect(aimedAsterism(snapshot, attitude, 25)?.asterism.id).toBe('cassiopeia');
    expect(aimedAsterism(snapshot, attitude, 3)).toBeNull();
  });
});
