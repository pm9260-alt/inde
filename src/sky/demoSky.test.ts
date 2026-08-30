/**
 * デモ用の空の検証。
 *
 * 「星座の形と星の色は本物のまま、置き場所だけを移す」ことが前提なので、
 * 剛体回転になっていること（角距離が保たれること）を確かめる。
 */
import { describe, expect, it } from 'vitest';

import { angleBetween, altitudeOf, azimuthOf, enuFromAltAz, vec } from '../astro/math';
import { directionAt, starIndexByHr } from '../astro/sky';
import { asterismById, asterismStarHrs } from '../data/constellations';
import { STAR_CATALOG } from '../data/stars.generated';
import {
  DEMO_ASTERISM_ID,
  DEMO_CONDITIONS,
  placedSnapshot,
  referenceSnapshot,
} from './demoSky';
import { asterismCenter } from './selection';

const orion = asterismById(DEMO_ASTERISM_ID);

describe('基準の空', () => {
  it('オリオン座が地平線より上にある', () => {
    const center = asterismCenter(referenceSnapshot(), orion);
    expect(altitudeOf(center)).toBeGreaterThan(20);
  });

  it('二度呼んでも同じものを返す（作り直さない）', () => {
    expect(referenceSnapshot()).toBe(referenceSnapshot());
  });
});

describe('置き直した空', () => {
  const anchors = [
    enuFromAltAz(45, 0),
    enuFromAltAz(30, 137),
    enuFromAltAz(70, 250),
    enuFromAltAz(89, 10),
  ];

  it('星座の中心が指定した方向に来る', () => {
    for (const anchor of anchors) {
      const center = asterismCenter(placedSnapshot(anchor), orion);
      expect(angleBetween(center, anchor)).toBeLessThan(0.01);
    }
  });

  it('星どうしの角距離が変わらない（剛体回転になっている）', () => {
    const reference = referenceSnapshot();
    const placed = placedSnapshot(enuFromAltAz(40, 210));
    const hrs = asterismStarHrs(orion);
    for (let i = 0; i < hrs.length; i += 1) {
      for (let j = i + 1; j < hrs.length; j += 1) {
        const before = angleBetween(
          directionAt(reference, starIndexByHr(hrs[i])),
          directionAt(reference, starIndexByHr(hrs[j])),
        );
        const after = angleBetween(
          directionAt(placed, starIndexByHr(hrs[i])),
          directionAt(placed, starIndexByHr(hrs[j])),
        );
        expect(Math.abs(after - before)).toBeLessThan(0.01);
      }
    }
  });

  it('背景の星もいっしょに動く', () => {
    // 空全体をまとめて回すので、オリオン座以外の星との位置関係も保たれる。
    const reference = referenceSnapshot();
    const placed = placedSnapshot(enuFromAltAz(55, 90));
    const betelgeuse = starIndexByHr(2061);
    const sirius = starIndexByHr(2491); // おおいぬ座シリウス
    const before = angleBetween(
      directionAt(reference, betelgeuse),
      directionAt(reference, sirius),
    );
    const after = angleBetween(directionAt(placed, betelgeuse), directionAt(placed, sirius));
    expect(Math.abs(after - before)).toBeLessThan(0.01);
  });

  it('すべての星が単位ベクトルのまま', () => {
    const placed = placedSnapshot(enuFromAltAz(35, 300));
    for (let i = 0; i < STAR_CATALOG.length; i += 10) {
      const d = directionAt(placed, i);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 4);
    }
  });

  it('高度が方向ベクトルと矛盾しない', () => {
    const placed = placedSnapshot(enuFromAltAz(50, 45));
    for (let i = 0; i < STAR_CATALOG.length; i += 37) {
      expect(placed.altitudes[i]).toBeCloseTo(altitudeOf(directionAt(placed, i)), 3);
    }
  });

  it('置き直しても星座が逆さまにならない', () => {
    // 頭のメイサは足のリゲルより上にある。どの方向へ置いても崩れないこと。
    for (const anchor of anchors) {
      const placed = placedSnapshot(anchor);
      const head = directionAt(placed, starIndexByHr(1879));
      const foot = directionAt(placed, starIndexByHr(1713));
      expect(altitudeOf(head)).toBeGreaterThan(altitudeOf(foot));
    }
  });

  it('基準の空での傾きが保たれる', () => {
    // 三つ星の並びが地平線となす角は、置き直しても変わらない。
    const reference = referenceSnapshot();
    const placed = placedSnapshot(enuFromAltAz(60, 180));
    const tilt = (snapshot: ReturnType<typeof referenceSnapshot>): number => {
      const a = directionAt(snapshot, starIndexByHr(1852));
      const b = directionAt(snapshot, starIndexByHr(1948));
      return altitudeOf(a) - altitudeOf(b);
    };
    // 高度差そのものは球面上の位置で変わるが、符号は保たれる。
    expect(Math.sign(tilt(placed))).toBe(Math.sign(tilt(reference)));
  });

  it('真上に置いても破綻しない', () => {
    const placed = placedSnapshot(vec(0, 0, 1));
    const center = asterismCenter(placed, orion);
    expect(altitudeOf(center)).toBeGreaterThan(89);
    expect(Number.isFinite(azimuthOf(center))).toBe(true);
  });

  it('長さ 0 の方向を渡しても基準の空を返す', () => {
    expect(placedSnapshot(vec(0, 0, 0))).toBe(referenceSnapshot());
  });
});

describe('デモの空の条件', () => {
  it('太陽も月も地平線の下に固定されている', () => {
    expect(DEMO_CONDITIONS.sunAltitude).toBeLessThan(-18);
    expect(DEMO_CONDITIONS.moonAltitude).toBeLessThan(0);
  });
});
