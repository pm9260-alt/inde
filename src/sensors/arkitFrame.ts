/**
 * ARKit の姿勢を、本アプリの座標系に読み替える。
 *
 * 軸の対応は Apple のドキュメントの記述から決めている。推測はしていない。
 *
 * ARKit のワールド座標系（worldAlignment = .gravityAndHeading）
 * ---------------------------------------------------------------------------
 *   「The vector (0,0,-1) points to true north and the vector (0,0,1)... 
 *     That is, the positive x-, y-, and z-axes point east, up, and south,
 *     respectively.」
 *   （ARConfiguration.WorldAlignment.gravityAndHeading）
 *   → x = 東, y = 天頂, z = 南
 *   本アプリの ENU は x = 東, y = 北, z = 天頂 なので
 *     東 = x,  北 = −z,  天頂 = y
 *   これは x 軸まわりの +90° 回転にあたる。
 *
 * ARKit のカメラ座標系（ARCamera.transform）
 * ---------------------------------------------------------------------------
 *   「the x-axis always points along the long axis of the device, from the
 *     front-facing camera toward the Home button. The y-axis points upward
 *     (with respect to landscapeRight orientation), and the z-axis points
 *     away from the device on the screen side.」
 *   端末座標系（CoreMotion / UIKit・縦持ち基準で x = 右辺, y = 上辺,
 *   z = 画面から手前）で言うと、
 *     x_cam = 上辺から下辺へ = −y_dev
 *     z_cam = 画面から手前   = +z_dev
 *   右手系（x × y = z）より
 *     y_cam = z_cam × x_cam = z_dev × (−y_dev) = +x_dev
 *   したがって カメラ → 端末 は天頂軸（端末の z 軸）まわりの −90° 回転。
 *
 * まとめると
 *   R(端末→ENU) = R(ワールド→ENU) · R(カメラ→ワールド) · R(端末→カメラ)
 *               = Rx(+90°)        · ARKit が返す回転   · Rz(+90°)
 *
 * この読み替えが正しいかどうかは、実機で重力ベクトルと突き合わせて
 * 検証できる（arkitGravityError）。仕様の読み違いがあれば、そこに
 * 大きな角度差として現れる。
 */
import {
  angleBetween,
  DEG,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  rotate,
  scale,
  normalize,
  vec,
  type Quat,
  type Vec3,
} from '../astro/math';

/** ワールド (東, 天頂, 南) → ENU (東, 北, 天頂)。x 軸まわり +90°。 */
const WORLD_TO_ENU: Quat = quatFromAxisAngle(vec(1, 0, 0), 90 * DEG);

/** 端末 → カメラ。端末の z 軸まわり +90°。 */
const DEVICE_TO_CAMERA: Quat = quatFromAxisAngle(vec(0, 0, 1), 90 * DEG);

/**
 * ARKit が返すカメラ姿勢（カメラ → ワールド）を、本アプリの
 * 端末 → ENU 回転に直す。
 */
export const enuAttitudeFromArkitCamera = (cameraToWorld: Quat): Quat =>
  quatNormalize(
    quatMultiply(quatMultiply(WORLD_TO_ENU, quatNormalize(cameraToWorld)), DEVICE_TO_CAMERA),
  );

/**
 * 読み替えが正しいかを、独立した測定で確かめる。
 *
 * 姿勢が正しければ、端末座標系の重力ベクトルを ENU へ写したものは
 * 真下 (0, 0, -1) を向くはず。CoreMotion の重力は ARKit とは別の経路で
 * 得られるので、軸の取り違えがあればここに大きな角度差が出る。
 *
 * @returns 真下からのずれ（度）。重力が得られない場合は null。
 */
export const arkitGravityError = (attitude: Quat, gravityDevice: Vec3): number | null => {
  const gravity = normalize(gravityDevice);
  if (!gravity) return null;
  return angleBetween(rotate(attitude, gravity), vec(0, 0, -1));
};

/**
 * 検証で許す角度差。
 *
 * 端末が動いているあいだは CoreMotion の重力にも遅れがあるので、
 * ある程度の幅が要る。一方、軸を 90° 取り違えていれば必ずこれを超える。
 */
export const ARKIT_GRAVITY_TOLERANCE_DEG = 12;

/**
 * 検証用に、既知の端末姿勢から ARKit が返すはずの値を逆算する。
 * テストと、実機で見比べるための診断に使う。
 */
export const arkitCameraFromEnuAttitude = (deviceToEnu: Quat): Quat =>
  quatNormalize(
    quatMultiply(
      quatMultiply(quatFromAxisAngle(vec(1, 0, 0), -90 * DEG), quatNormalize(deviceToEnu)),
      quatFromAxisAngle(vec(0, 0, 1), -90 * DEG),
    ),
  );

/** 端末座標系での重力（m/s^2 相当）を、姿勢から作る。テスト用。 */
export const gravityInDeviceFrame = (deviceToEnu: Quat, magnitude = 9.80665): Vec3 => {
  const { w, x, y, z } = deviceToEnu;
  // ENU の真下 (0,0,-1) を端末座標へ。rotateInverse を展開したもの。
  const inverse: Quat = { w, x: -x, y: -y, z: -z };
  return scale(rotate(inverse, vec(0, 0, -1)), magnitude);
};
