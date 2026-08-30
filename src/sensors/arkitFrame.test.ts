/**
 * ARKit の座標系の読み替えの検証。
 *
 * 自己整合（往復して戻る）だけでは、軸の取り違えを見つけられない。
 * ここでは Apple の記述から物理的に決まる姿勢を手で組み立て、
 * その値を入れたときに正しい向きが出ることを確かめる。
 */
import { describe, expect, it } from 'vitest';

import {
  altitudeOf,
  angleBetween,
  azimuthOf,
  cross,
  DEG,
  dot,
  enuFromAltAz,
  normalize,
  quatAngleBetween,
  quatFromAxisAngle,
  quatFromMat3,
  quatMultiply,
  quatNormalize,
  rotate,
  scale,
  sub,
  vec,
  type Quat,
} from '../astro/math';
import {
  ARKIT_GRAVITY_TOLERANCE_DEG,
  arkitCameraFromEnuAttitude,
  arkitGravityError,
  enuAttitudeFromArkitCamera,
  gravityInDeviceFrame,
} from './arkitFrame';

/** 列ベクトル 3 本（各軸の行き先）から回転クォータニオンを作る。 */
const fromColumns = (
  c0: readonly [number, number, number],
  c1: readonly [number, number, number],
  c2: readonly [number, number, number],
): Quat =>
  quatFromMat3([
    c0[0], c1[0], c2[0],
    c0[1], c1[1], c2[1],
    c0[2], c1[2], c2[2],
  ]);

/** 背面カメラを (高度, 方位) に向けた端末姿勢。 */
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

/**
 * ARKit のワールド座標は (東, 天頂, 南)。
 * 端末の各軸がどの実世界方向を向くかを決めれば、カメラ姿勢が組み立てられる。
 *
 * カメラ軸と端末軸の対応（Apple の記述より）
 *   x_cam = −y_dev,  y_cam = +x_dev,  z_cam = +z_dev
 */
const arkitCameraForDeviceAxes = (
  xDevWorld: readonly [number, number, number],
  yDevWorld: readonly [number, number, number],
  zDevWorld: readonly [number, number, number],
): Quat =>
  fromColumns(
    [-yDevWorld[0], -yDevWorld[1], -yDevWorld[2]], // x_cam = −y_dev
    xDevWorld, // y_cam = +x_dev
    zDevWorld, // z_cam = +z_dev
  );

// ARKit ワールド座標での実世界方向。x = 東, y = 天頂, z = 南。
const EAST = [1, 0, 0] as const;
const WEST = [-1, 0, 0] as const;
const UP = [0, 1, 0] as const;
const DOWN = [0, -1, 0] as const;
const SOUTH = [0, 0, 1] as const;
const NORTH = [0, 0, -1] as const;

describe('ARKit の姿勢を ENU へ読み替える', () => {
  it('端末を垂直に立てて背面カメラを北へ向けたとき、視線が北の地平線を指す', () => {
    // 縦持ちで垂直。−z_dev（背面カメラ）が北 → z_dev = 南。
    // y_dev（上辺）= 天頂、x_dev（右辺）= 東。
    const camera = arkitCameraForDeviceAxes(EAST, UP, SOUTH);
    const attitude = enuAttitudeFromArkitCamera(camera);

    const view = rotate(attitude, vec(0, 0, -1));
    expect(altitudeOf(view)).toBeCloseTo(0, 5);
    expect(azimuthOf(view)).toBeCloseTo(0, 5);
    // 画面の上辺は天頂を向いている。
    expect(altitudeOf(rotate(attitude, vec(0, 1, 0)))).toBeCloseTo(90, 5);
  });

  it('画面を上にして水平に置いたとき、視線が真下を指す', () => {
    // x_dev = 東, y_dev = 北, z_dev = 天頂。背面カメラは真下を向く。
    const camera = arkitCameraForDeviceAxes(EAST, NORTH, UP);
    const attitude = enuAttitudeFromArkitCamera(camera);
    expect(altitudeOf(rotate(attitude, vec(0, 0, -1)))).toBeCloseTo(-90, 5);
    // 上辺は北を向いている。
    expect(azimuthOf(rotate(attitude, vec(0, 1, 0)))).toBeCloseTo(0, 5);
  });

  it('画面を下にして水平に構えたとき、視線が天頂を指す', () => {
    // 上辺を北へ向けて画面を伏せる。右手系より x_dev = 西。
    const camera = arkitCameraForDeviceAxes(WEST, NORTH, DOWN);
    const attitude = enuAttitudeFromArkitCamera(camera);
    expect(altitudeOf(rotate(attitude, vec(0, 0, -1)))).toBeCloseTo(90, 5);
  });

  it('背面カメラを東へ向けたとき、方位が 90 度になる', () => {
    // −z_dev = 東 → z_dev = 西。y_dev = 天頂、x_dev = 南。
    const camera = arkitCameraForDeviceAxes(SOUTH, UP, WEST);
    const attitude = enuAttitudeFromArkitCamera(camera);
    const view = rotate(attitude, vec(0, 0, -1));
    expect(azimuthOf(view)).toBeCloseTo(90, 5);
    expect(altitudeOf(view)).toBeCloseTo(0, 5);
  });

  it('南半球でも同じ読み替えで成り立つ（軸の対応に半球は関係しない）', () => {
    // 背面カメラを南の空 45° へ。座標系の読み替えは観測地に依らない。
    const truth = lookingAt(45, 180);
    const camera = arkitCameraFromEnuAttitude(truth);
    expect(quatAngleBetween(enuAttitudeFromArkitCamera(camera), truth)).toBeLessThan(1e-6);
  });

  it('往復しても元に戻る', () => {
    for (const [alt, az] of [
      [0, 0],
      [35, 137],
      [-25, 300],
      [88, 12],
      [60, 265],
    ]) {
      const truth = lookingAt(alt, az);
      const roundTrip = enuAttitudeFromArkitCamera(arkitCameraFromEnuAttitude(truth));
      expect(quatAngleBetween(roundTrip, truth)).toBeLessThan(1e-6);
    }
  });
});

describe('重力による検算', () => {
  it('正しく読み替えられていれば、ずれはほぼ 0', () => {
    for (const [alt, az] of [
      [0, 0],
      [40, 210],
      [-30, 90],
      [75, 330],
    ]) {
      const truth = lookingAt(alt, az);
      const attitude = enuAttitudeFromArkitCamera(arkitCameraFromEnuAttitude(truth));
      const error = arkitGravityError(attitude, gravityInDeviceFrame(truth));
      expect(error).not.toBeNull();
      expect(error!).toBeLessThan(1e-4);
    }
  });

  it('端末→カメラの回転を逆向きに読むと、許容値を超える差として現れる', () => {
    // Apple の記述を取り違えて Rz(−90°) を掛けてしまった場合。
    const truth = lookingAt(30, 120);
    const camera = arkitCameraFromEnuAttitude(truth);
    const wrong = quatNormalize(
      quatMultiply(
        quatMultiply(quatFromAxisAngle(vec(1, 0, 0), 90 * DEG), camera),
        quatFromAxisAngle(vec(0, 0, 1), -90 * DEG),
      ),
    );
    const error = arkitGravityError(wrong, gravityInDeviceFrame(truth));
    expect(error!).toBeGreaterThan(ARKIT_GRAVITY_TOLERANCE_DEG);
  });

  it('ワールド→ENU の回転を逆向きに読むと、許容値を超える差として現れる', () => {
    // 「z 軸は南」を「z 軸は北」と取り違えた場合に相当する。
    const truth = lookingAt(30, 120);
    const camera = arkitCameraFromEnuAttitude(truth);
    const wrong = quatNormalize(
      quatMultiply(
        quatMultiply(quatFromAxisAngle(vec(1, 0, 0), -90 * DEG), camera),
        quatFromAxisAngle(vec(0, 0, 1), 90 * DEG),
      ),
    );
    const error = arkitGravityError(wrong, gravityInDeviceFrame(truth));
    expect(error!).toBeGreaterThan(ARKIT_GRAVITY_TOLERANCE_DEG);
  });

  it('方位だけのずれは、この検算では捉えられない', () => {
    // 重力は鉛直の情報しか持たないので、天頂軸まわりの回転は検出できない。
    // つまりこの検算が保証するのは「軸の対応と傾き」であって、
    // コンパスの絶対方位が合っていることではない。そこは実際の星で見る。
    const truth = lookingAt(30, 120);
    const shifted = lookingAt(30, 150);
    const attitude = enuAttitudeFromArkitCamera(arkitCameraFromEnuAttitude(shifted));
    expect(arkitGravityError(attitude, gravityInDeviceFrame(truth))!).toBeLessThan(1e-4);
  });

  it('画面を伏せて真上を向けても検算が通る（天頂でも破綻しない）', () => {
    const truth = lookingAt(89.5, 0);
    const attitude = enuAttitudeFromArkitCamera(arkitCameraFromEnuAttitude(truth));
    expect(arkitGravityError(attitude, gravityInDeviceFrame(truth))!).toBeLessThan(1e-4);
  });

  it('重力がゼロなら判定しない', () => {
    expect(arkitGravityError(lookingAt(0, 0), vec(0, 0, 0))).toBeNull();
  });

  it('許容値は 90 度の取り違えを必ず捉える大きさになっている', () => {
    expect(ARKIT_GRAVITY_TOLERANCE_DEG).toBeGreaterThan(5);
    expect(ARKIT_GRAVITY_TOLERANCE_DEG).toBeLessThan(45);
  });
});

describe('端末座標での重力', () => {
  it('端末を垂直に立てているとき、重力は画面の下向き', () => {
    const gravity = gravityInDeviceFrame(lookingAt(0, 0));
    expect(gravity.x).toBeCloseTo(0, 6);
    expect(gravity.y).toBeCloseTo(-9.80665, 6);
    expect(gravity.z).toBeCloseTo(0, 6);
  });

  it('画面を上にして水平に置いたとき、重力は −z', () => {
    const gravity = gravityInDeviceFrame(lookingAt(-90, 0));
    expect(gravity.z).toBeCloseTo(-9.80665, 6);
  });

  it('大きさが保たれる', () => {
    const gravity = gravityInDeviceFrame(lookingAt(33, 217));
    expect(Math.hypot(gravity.x, gravity.y, gravity.z)).toBeCloseTo(9.80665, 6);
  });
});

describe('視線と姿勢の整合', () => {
  it('ARKit 経由で復元した姿勢の視線が、元の向きと一致する', () => {
    for (const [alt, az] of [
      [10, 45],
      [70, 200],
      [-15, 350],
    ]) {
      const truth = lookingAt(alt, az);
      const attitude = enuAttitudeFromArkitCamera(arkitCameraFromEnuAttitude(truth));
      expect(angleBetween(rotate(attitude, vec(0, 0, -1)), enuFromAltAz(alt, az))).toBeLessThan(
        1e-5,
      );
    }
  });
});
