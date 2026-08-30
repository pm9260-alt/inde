/**
 * 空の方向を画面上の点に落とす。
 *
 * 前提
 * ---------------------------------------------------------------------------
 * ・背面カメラの光軸は端末座標の −z。画面の右は +x、上は +y。
 * ・iOS のカメラプレビューは AVLayerVideoGravity.resizeAspectFill、つまり
 *   縦横比を保ったまま短い辺に合わせて切り取られる。iPhone の画面（縦持ちで
 *   w/h ≒ 0.46）はセンサーの 3:4（0.75）より細いため、切り取られるのは常に
 *   左右で、上下（センサーの長辺方向）は全画角がそのまま映る。
 *   したがって「垂直画角」を 1 つ決めれば、水平画角は画面の縦横比から従う。
 *
 * 画角の実測値について
 * ---------------------------------------------------------------------------
 * expo-camera は画角を公開しない。Apple の公表値「26mm 相当」から計算すると、
 * 35mm 換算を長辺で取るか対角で取るかで長辺画角は 67.3°〜69.4° と 2° 割れる。
 * どちらが正しいかは仕様書からは決められないため、既定値は中間の 68.0° とし、
 * アプリ内で実測較正できるようにしてある（docs/ACCURACY.md の手順 3）。
 * 機種によっても異なる（iPhone 15 Pro の主カメラは 24mm 相当）。
 */
import { DEG, RAD, rotateInverse, type Quat, type Vec3 } from './math';

/** 未較正時の垂直画角（度）。iPhone の主カメラ（26mm 相当）を想定。 */
export const DEFAULT_VERTICAL_FOV_DEG = 68.0;

export interface Viewport {
  /** 論理ピクセルでの描画領域。 */
  readonly width: number;
  readonly height: number;
}

export interface CameraProjection {
  /** 画面中心からの水平方向の焦点距離（ピクセル）。 */
  readonly focalX: number;
  /** 同、垂直方向。 */
  readonly focalY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly verticalFovDeg: number;
  readonly horizontalFovDeg: number;
}

/**
 * 垂直画角と描画領域から投影パラメータを作る。
 * 水平画角は resizeAspectFill の切り取りから導く（上記の理由で縦が基準）。
 */
export const makeProjection = (
  viewport: Viewport,
  verticalFovDeg: number = DEFAULT_VERTICAL_FOV_DEG,
): CameraProjection => {
  const halfV = (verticalFovDeg / 2) * DEG;
  const tanHalfV = Math.tan(halfV);
  const focalY = viewport.height / 2 / tanHalfV;
  // 画素は正方形なので、水平の焦点距離は垂直と同じ。画角だけが幅で決まる。
  const focalX = focalY;
  const tanHalfH = viewport.width / 2 / focalX;
  return {
    focalX,
    focalY,
    centerX: viewport.width / 2,
    centerY: viewport.height / 2,
    verticalFovDeg,
    horizontalFovDeg: 2 * Math.atan(tanHalfH) * RAD,
  };
};

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  /** 視線方向の成分。0 以下なら端末の背後にある。 */
  readonly depth: number;
  /** 画面内に収まっているか。 */
  readonly onScreen: boolean;
}

/** 画面外の点を捨てるときの余裕（ピクセル）。星の光芒が半分見えるように。 */
const SCREEN_MARGIN_PX = 48;

/**
 * ENU の方向ベクトルを画面座標へ。
 *
 * @param attitude DEV → ENU の回転
 * @param direction ENU の単位ベクトル
 */
export const projectToScreen = (
  attitude: Quat,
  direction: Vec3,
  projection: CameraProjection,
  viewport: Viewport,
): ScreenPoint => {
  // ENU → 端末座標。
  const d = rotateInverse(attitude, direction);
  // 背面カメラは −z を向いているので、前方成分は −z。
  const depth = -d.z;
  if (depth <= 1e-6) {
    return { x: Number.NaN, y: Number.NaN, depth, onScreen: false };
  }
  const x = projection.centerX + (d.x / depth) * projection.focalX;
  // 画面の y は下向きなので符号を反転する。
  const y = projection.centerY - (d.y / depth) * projection.focalY;
  const onScreen =
    x >= -SCREEN_MARGIN_PX &&
    x <= viewport.width + SCREEN_MARGIN_PX &&
    y >= -SCREEN_MARGIN_PX &&
    y <= viewport.height + SCREEN_MARGIN_PX;
  return { x, y, depth, onScreen };
};

/** いま端末が向いている方向（背面カメラの光軸）を ENU で返す。 */
export const viewingDirection = (attitude: Quat): Vec3 => {
  // 端末座標の (0, 0, -1) を ENU へ。
  const { w, x, y, z } = attitude;
  // rotate(q, (0,0,-1)) を展開したもの。
  return {
    x: -(2 * (x * z + w * y)),
    y: -(2 * (y * z - w * x)),
    z: -(1 - 2 * (x * x + y * y)),
  };
};
