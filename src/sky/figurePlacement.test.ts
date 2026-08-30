/**
 * 登場人物の置き場所の検証。
 *
 * 3D モデルが入る前に、置き場所と大きさが妥当かを確かめておく。
 * ここが狂っていると、モデルを差した瞬間に星座から外れて浮く。
 */
import { describe, expect, it } from 'vitest';

import { altitudeOf, angleBetween, enuFromAltAz, type Vec3 } from '../astro/math';
import { directionAt, starIndexByHr } from '../astro/sky';
import { asterismById, asterismStarHrs } from '../data/constellations';
import { figureById, FIGURES, hasModel } from '../data/figures';
import { referenceSnapshot } from './demoSky';
import { computeFigureFrame, frameEdges } from './figurePlacement';
import { asterismCenter, asterismRadius } from './selection';

const snapshot = referenceSnapshot();
const directionOf = (hr: number): Vec3 => directionAt(snapshot, starIndexByHr(hr));

describe('登場人物のデータ', () => {
  it('ID が重複していない', () => {
    const ids = FIGURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('物差しにする星が星表にある', () => {
    for (const figure of FIGURES) {
      expect(() => starIndexByHr(figure.placement.baseFromHr)).not.toThrow();
      expect(() => starIndexByHr(figure.placement.baseToHr)).not.toThrow();
    }
  });

  it('物差しの 2 星が同じでない', () => {
    for (const figure of FIGURES) {
      expect(figure.placement.baseFromHr).not.toBe(figure.placement.baseToHr);
    }
  });

  it('星座が指す登場人物が存在する', () => {
    for (const id of ['orion', 'scorpius', 'cassiopeia', 'big-dipper', 'summer-triangle']) {
      const asterism = asterismById(id);
      expect(asterism.figureId).toBeTruthy();
      expect(figureById(asterism.figureId!)).not.toBeNull();
    }
  });

  it('物差しの星がその星座に属している', () => {
    for (const id of ['orion', 'scorpius', 'cassiopeia', 'big-dipper', 'summer-triangle']) {
      const asterism = asterismById(id);
      const figure = figureById(asterism.figureId!)!;
      const members = asterismStarHrs(asterism);
      expect(members).toContain(figure.placement.baseFromHr);
      expect(members).toContain(figure.placement.baseToHr);
    }
  });

  it('まだ 3D モデルは入っていない（枠で表示される）', () => {
    for (const figure of FIGURES) {
      expect(hasModel(figure)).toBe(false);
    }
  });

  it('神話の場面が指す登場人物のうち、星座に結びついたものは定義されている', () => {
    for (const id of ['orion', 'scorpius', 'cassiopeia', 'big-dipper', 'summer-triangle']) {
      const figureId = asterismById(id).figureId!;
      expect(FIGURES.some((f) => f.id === figureId)).toBe(true);
    }
  });
});

describe('枠の計算', () => {
  const orion = asterismById('orion');
  const hunter = figureById('orion-hunter')!;

  it('四隅と中心が返る', () => {
    const frame = computeFigureFrame(hunter, directionOf);
    expect(frame).not.toBeNull();
    expect(frame!.corners).toHaveLength(4);
    for (const corner of frame!.corners) {
      expect(Math.hypot(corner.x, corner.y, corner.z)).toBeCloseTo(1, 6);
    }
  });

  it('狩人が星座とほぼ重なる位置と大きさになる', () => {
    const frame = computeFigureFrame(hunter, directionOf)!;
    const center = asterismCenter(snapshot, orion);
    // 中心が星座の中心から大きく外れない。
    expect(angleBetween(frame.center, center)).toBeLessThan(5);
    // 身の丈が星座の広がりと釣り合っている。
    const radius = asterismRadius(snapshot, orion);
    expect(frame.heightDeg).toBeGreaterThan(radius);
    expect(frame.heightDeg).toBeLessThan(radius * 3);
  });

  it('枠は上下が縦、左右が横になっている', () => {
    const frame = computeFigureFrame(hunter, directionOf)!;
    const [bottomLeft, bottomRight, topRight, topLeft] = frame.corners;
    expect(altitudeOf(topLeft)).toBeGreaterThan(altitudeOf(bottomLeft));
    expect(altitudeOf(topRight)).toBeGreaterThan(altitudeOf(bottomRight));
    // 高さのほうが幅より大きい（狩人は縦長）。
    expect(angleBetween(bottomLeft, topLeft)).toBeGreaterThan(
      angleBetween(bottomLeft, bottomRight),
    );
  });

  it('出現の途中では小さい', () => {
    const full = computeFigureFrame(hunter, directionOf, 1)!;
    const entering = computeFigureFrame(hunter, directionOf, 0.94)!;
    expect(entering.heightDeg).toBeLessThan(full.heightDeg);
    // 中心は動かない。大きさだけが変わる。
    expect(angleBetween(entering.center, full.center)).toBeLessThan(1e-6);
  });

  it('すべての登場人物で枠が作れる', () => {
    for (const figure of FIGURES) {
      expect(computeFigureFrame(figure, directionOf), figure.id).not.toBeNull();
    }
  });

  it('物差しの 2 星が同じ方向なら作れない', () => {
    const degenerate = { ...hunter, placement: { ...hunter.placement, baseToHr: hunter.placement.baseFromHr } };
    expect(computeFigureFrame(degenerate, directionOf)).toBeNull();
  });

  it('真上に置いても破綻しない', () => {
    // 接平面の「上」が定まらない特異な向き。
    const zenith = (hr: number): Vec3 =>
      hr === hunter.placement.baseFromHr ? enuFromAltAz(89.9, 0) : enuFromAltAz(88, 90);
    const frame = computeFigureFrame(hunter, zenith);
    expect(frame).not.toBeNull();
    for (const corner of frame!.corners) {
      expect(Number.isFinite(corner.x)).toBe(true);
      expect(Number.isFinite(corner.y)).toBe(true);
      expect(Number.isFinite(corner.z)).toBe(true);
    }
  });

  it('枠は 4 本の線で閉じている', () => {
    const frame = computeFigureFrame(hunter, directionOf)!;
    const edges = frameEdges(frame);
    expect(edges).toHaveLength(4);
    // 最後の線の終点が最初の線の始点に戻る。
    expect(edges[3].to).toBe(edges[0].from);
  });
});
