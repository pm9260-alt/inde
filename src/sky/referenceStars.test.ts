import { describe, expect, it } from 'vitest';

import { computeSkySnapshot } from '../astro/sky';
import { brightReferenceStars, referenceStarAltitude } from './referenceStars';

/** 世界各地。半球や緯度に依存しないことを確かめる。 */
const SITES = [
  ['東京', { latitude: 35.68, longitude: 139.77, elevation: 40 }],
  ['シドニー', { latitude: -33.87, longitude: 151.21, elevation: 20 }],
  ['ナイロビ', { latitude: -1.29, longitude: 36.82, elevation: 1700 }],
  ['レイキャビク', { latitude: 64.15, longitude: -21.94, elevation: 30 }],
  ['サンティアゴ', { latitude: -33.45, longitude: -70.67, elevation: 570 }],
] as const;

const TIMES = [
  new Date('2026-01-15T12:00:00Z'),
  new Date('2026-07-20T12:00:00Z'),
];

describe('基準になる星の選択', () => {
  for (const [name, site] of SITES) {
    for (const time of TIMES) {
      it(`${name} / ${time.toISOString().slice(0, 10)} で候補が見つかる`, () => {
        const snapshot = computeSkySnapshot(site, time);
        const stars = brightReferenceStars(snapshot);
        // どの地点・どの時刻でも、空には明るい星がいくつか出ている。
        expect(stars.length).toBeGreaterThan(0);
        for (const star of stars) {
          expect(star.name).toBeTruthy();
          expect(star.magnitude).toBeLessThanOrEqual(2.2);
          expect(star.altitudeDeg).toBeGreaterThanOrEqual(20);
          expect(star.azimuthDeg).toBeGreaterThanOrEqual(0);
          expect(star.azimuthDeg).toBeLessThan(360);
        }
      });
    }
  }

  it('明るい順に並ぶ', () => {
    const snapshot = computeSkySnapshot(
      { latitude: 35.68, longitude: 139.77, elevation: 40 },
      new Date('2026-01-15T12:00:00Z'),
    );
    const stars = brightReferenceStars(snapshot);
    for (let i = 1; i < stars.length; i += 1) {
      expect(stars[i].magnitude).toBeGreaterThanOrEqual(stars[i - 1].magnitude);
    }
  });

  it('件数の上限が効く', () => {
    const snapshot = computeSkySnapshot(
      { latitude: 35.68, longitude: 139.77, elevation: 40 },
      new Date('2026-01-15T12:00:00Z'),
    );
    expect(brightReferenceStars(snapshot, 3).length).toBeLessThanOrEqual(3);
  });

  it('高度が方向ベクトルと矛盾しない', () => {
    const snapshot = computeSkySnapshot(
      { latitude: -33.87, longitude: 151.21, elevation: 20 },
      new Date('2026-07-20T12:00:00Z'),
    );
    for (const star of brightReferenceStars(snapshot)) {
      expect(referenceStarAltitude(snapshot, star)).toBeCloseTo(star.altitudeDeg, 3);
    }
  });

  it('南半球ではカノープスのような南天の星が候補に入りうる', () => {
    // 東京では地平線下、シドニーでは高く昇る星が扱えること。
    const sydney = computeSkySnapshot(
      { latitude: -33.87, longitude: 151.21, elevation: 20 },
      new Date('2026-01-15T12:00:00Z'),
    );
    const names = brightReferenceStars(sydney, 20).map((s) => s.name);
    expect(names.length).toBeGreaterThan(2);
    // 北天専用の星ばかりではないこと（北極星は南半球からは見えない）。
    expect(names).not.toContain('Polaris');
  });
});
