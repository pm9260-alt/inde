/**
 * 描画用の 4x4 行列。列優先（OpenGL の規約）で Float32Array に詰める。
 *
 * 視点座標系は端末座標系そのものを使う。端末の x が右、y が上、−z が
 * 背面カメラの光軸で、これは OpenGL の視点座標系（右・上・−z 前方）と
 * 完全に一致する。余計な軸の入れ替えが要らない。
 */
import { DEG, type Quat } from '../astro/math';

export type Mat4 = Float32Array;

export const identityMat4 = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * ENU から端末（視点）座標系への変換行列。
 * 姿勢 q は DEV → ENU なので、その逆回転を使う。
 */
export const viewMatrixFromAttitude = (attitude: Quat, out: Mat4 = identityMat4()): Mat4 => {
  const { w, x, y, z } = attitude;
  // DEV → ENU の回転行列 R。
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - w * z);
  const r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);

  // 必要なのは ENU → DEV なので転置。さらに列優先で並べるためもう一度
  // 入れ替わり、結果として R の要素をそのままの順で置くことになる。
  out[0] = r00;
  out[1] = r01;
  out[2] = r02;
  out[3] = 0;
  out[4] = r10;
  out[5] = r11;
  out[6] = r12;
  out[7] = 0;
  out[8] = r20;
  out[9] = r21;
  out[10] = r22;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
};

/**
 * 透視投影。星は無限遠にあるものとして単位球面上に置くので、
 * near/far は描画範囲を含みさえすればよい。
 */
export const perspectiveMatrix = (
  verticalFovDeg: number,
  aspect: number,
  out: Mat4 = identityMat4(),
): Mat4 => {
  const f = 1 / Math.tan((verticalFovDeg * DEG) / 2);
  const near = 0.05;
  const far = 10;
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
};

/** a のあとに b を適用する行列（b * a）。どちらも列優先。 */
export const multiplyMat4 = (b: Mat4, a: Mat4, out: Mat4 = identityMat4()): Mat4 => {
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += b[k * 4 + row] * a[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
};
