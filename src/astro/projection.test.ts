/**
 * 画面への投影の検証。
 * 画角の取り違えや上下左右の反転は、実機に出すまで気づきにくい種類の誤りなので、
 * 既知の姿勢と方向から画面上のどこに出るはずかを固定しておく。
 */
import { describe, expect, it } from 'vitest';

import {
  cross,
  DEG,
  dot,
  enuFromAltAz,
  normalize,
  quatFromMat3,
  scale,
  sub,
  vec,
  type Quat,
} from './math';
import {
  DEFAULT_VERTICAL_FOV_DEG,
  makeProjection,
  projectToScreen,
  viewingDirection,
} from './projection';

/** iPhone 15 相当の論理解像度。 */
const VIEWPORT = { width: 393, height: 852 };

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

describe('画角', () => {
  it('縦の画角がそのまま使われる', () => {
    const projection = makeProjection(VIEWPORT, 68);
    expect(projection.verticalFovDeg).toBe(68);
  });

  it('横の画角は画面の縦横比から決まり、縦より狭くなる', () => {
    // iPhone の画面はセンサーの 3:4 より細いので、左右が切り取られる。
    const projection = makeProjection(VIEWPORT, 68);
    expect(projection.horizontalFovDeg).toBeLessThan(68);
    expect(projection.horizontalFovDeg).toBeGreaterThan(30);
    expect(projection.horizontalFovDeg).toBeLessThan(40);
  });

  it('画素は正方形なので縦横の焦点距離が等しい', () => {
    const projection = makeProjection(VIEWPORT, 68);
    expect(projection.focalX).toBeCloseTo(projection.focalY, 9);
  });

  it('画角を広げると焦点距離が短くなる', () => {
    expect(makeProjection(VIEWPORT, 80).focalY).toBeLessThan(
      makeProjection(VIEWPORT, 60).focalY,
    );
  });

  it('既定値は iPhone の主カメラを想定した 68 度', () => {
    expect(DEFAULT_VERTICAL_FOV_DEG).toBeGreaterThan(60);
    expect(DEFAULT_VERTICAL_FOV_DEG).toBeLessThan(76);
  });
});

describe('画面への投影', () => {
  const projection = makeProjection(VIEWPORT, 68);

  it('向いている方向は画面の中央に来る', () => {
    const attitude = lookingAt(30, 120);
    const point = projectToScreen(attitude, enuFromAltAz(30, 120), projection, VIEWPORT);
    expect(point.x).toBeCloseTo(VIEWPORT.width / 2, 5);
    expect(point.y).toBeCloseTo(VIEWPORT.height / 2, 5);
    expect(point.onScreen).toBe(true);
  });

  it('上を向いた先の星は画面の上半分に出る', () => {
    const attitude = lookingAt(30, 0);
    const point = projectToScreen(attitude, enuFromAltAz(40, 0), projection, VIEWPORT);
    expect(point.y).toBeLessThan(VIEWPORT.height / 2);
    expect(point.x).toBeCloseTo(VIEWPORT.width / 2, 4);
  });

  it('東寄りの星は画面の右に出る（北を向いているとき）', () => {
    const attitude = lookingAt(0, 0);
    const point = projectToScreen(attitude, enuFromAltAz(0, 10), projection, VIEWPORT);
    expect(point.x).toBeGreaterThan(VIEWPORT.width / 2);
    expect(point.y).toBeCloseTo(VIEWPORT.height / 2, 3);
  });

  it('背後の星は画面に出ない', () => {
    const attitude = lookingAt(0, 0);
    const point = projectToScreen(attitude, enuFromAltAz(0, 180), projection, VIEWPORT);
    expect(point.depth).toBeLessThan(0);
    expect(point.onScreen).toBe(false);
  });

  it('画角のちょうど端が画面の端に来る', () => {
    const attitude = lookingAt(0, 0);
    const half = projection.verticalFovDeg / 2;
    const top = projectToScreen(attitude, enuFromAltAz(half, 0), projection, VIEWPORT);
    expect(top.y).toBeCloseTo(0, 3);
    const bottom = projectToScreen(attitude, enuFromAltAz(-half, 0), projection, VIEWPORT);
    expect(bottom.y).toBeCloseTo(VIEWPORT.height, 3);
  });

  it('画面上の距離が角度に対して単調に増える', () => {
    const attitude = lookingAt(0, 0);
    let previous = 0;
    for (let angle = 1; angle <= 30; angle += 1) {
      const point = projectToScreen(attitude, enuFromAltAz(angle, 0), projection, VIEWPORT);
      const distance = VIEWPORT.height / 2 - point.y;
      expect(distance).toBeGreaterThan(previous);
      previous = distance;
    }
  });

  it('画角を広げると同じ星がより中央寄りに描かれる', () => {
    const attitude = lookingAt(0, 0);
    const direction = enuFromAltAz(20, 0);
    const narrow = projectToScreen(attitude, direction, makeProjection(VIEWPORT, 50), VIEWPORT);
    const wide = projectToScreen(attitude, direction, makeProjection(VIEWPORT, 90), VIEWPORT);
    const narrowOffset = VIEWPORT.height / 2 - narrow.y;
    const wideOffset = VIEWPORT.height / 2 - wide.y;
    expect(wideOffset).toBeLessThan(narrowOffset);
  });

  it('1 度のずれが画面上でどれだけ動くかを固定しておく', () => {
    // 較正のときの目安。この値が変わるということは投影が変わったということ。
    const attitude = lookingAt(0, 0);
    const point = projectToScreen(attitude, enuFromAltAz(1, 0), projection, VIEWPORT);
    const pixelsPerDegree = VIEWPORT.height / 2 - point.y;
    expect(pixelsPerDegree).toBeGreaterThan(10.5);
    expect(pixelsPerDegree).toBeLessThan(11.5);
  });
});

describe('視線方向', () => {
  it('姿勢から求めた光軸が、その姿勢を作ったときの方向と一致する', () => {
    for (const [alt, az] of [
      [0, 0],
      [45, 90],
      [-20, 200],
      [89, 300],
    ]) {
      const direction = viewingDirection(lookingAt(alt, az));
      const expected = enuFromAltAz(alt, az);
      expect(direction.x).toBeCloseTo(expected.x, 9);
      expect(direction.y).toBeCloseTo(expected.y, 9);
      expect(direction.z).toBeCloseTo(expected.z, 9);
    }
  });

  it('返るベクトルは単位ベクトル', () => {
    const d = viewingDirection(lookingAt(33, 217));
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
  });
});

describe('画角の一貫性', () => {
  it('縦の画角と焦点距離の関係が定義どおり', () => {
    const projection = makeProjection(VIEWPORT, 68);
    const expectedFocal = VIEWPORT.height / 2 / Math.tan((68 / 2) * DEG);
    expect(projection.focalY).toBeCloseTo(expectedFocal, 9);
  });
});
