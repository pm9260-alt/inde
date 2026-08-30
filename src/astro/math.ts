/**
 * 姿勢と方向の計算に使う最小限の線形代数。
 *
 * 座標系の約束（このアプリ全体で一貫させる）
 * ---------------------------------------------------------------------------
 * ENU  : 観測者を原点とする地平座標の直交系。
 *          x = 東, y = 北, z = 天頂。右手系（x × y = z）。
 *          星の方向はすべてこの系の単位ベクトルで表す。
 *
 * DEV  : iOS の端末座標系（CoreMotion / UIKit と同じ）。
 *          x = 端末の右辺方向, y = 端末の上辺方向, z = 画面から手前に出る向き。
 *          背面カメラの光軸は −z。画面の向き（UI の回転）とは無関係に、
 *          常に筐体に固定されている。
 *
 * 姿勢は「DEV → ENU の回転」で表す。すなわち端末座標のベクトル v に対して
 * rotate(q, v) が ENU での向きを与える。
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 単位クォータニオン (w, x, y, z)。DEV → ENU の回転を表す。 */
export interface Quat {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 行優先の 3x3 行列。m[row * 3 + col]。 */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

/** 長さ 0 のベクトルは正規化できないため null を返す。呼び出し側で判断すること。 */
export const normalize = (a: Vec3): Vec3 | null => {
  const len = length(a);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  return vec(a.x / len, a.y / len, a.z / len);
};

/* --------------------------------------------------------------------------
 * 地平座標 ↔ ENU
 * -------------------------------------------------------------------------- */

/**
 * 方位角・高度（度）から ENU 単位ベクトルへ。
 * 方位角は北を 0 として東回り（東 = 90°）。astronomy-engine の HorizonFromVector
 * が返す規約と同じ。
 */
export const enuFromAltAz = (altitudeDeg: number, azimuthDeg: number): Vec3 => {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const horizontal = Math.cos(alt);
  return vec(horizontal * Math.sin(az), horizontal * Math.cos(az), Math.sin(alt));
};

/** ENU 単位ベクトルから高度（度）。 */
export const altitudeOf = (v: Vec3): number => Math.asin(Math.max(-1, Math.min(1, v.z))) * RAD;

/** ENU 単位ベクトルから方位角（度, 北を 0 とする東回り, 0〜360）。 */
export const azimuthOf = (v: Vec3): number => {
  const deg = Math.atan2(v.x, v.y) * RAD;
  return deg < 0 ? deg + 360 : deg;
};

/**
 * 2 方向のなす角（度）。
 *
 * acos(dot) は角が小さいときに桁落ちする。内積が 1 に近づくと、倍精度でも
 * 1e-16 の誤差が sqrt(2e-16) rad ≒ 0.001° に増幅され、Float32 で保持した
 * ベクトルでは 0.03° にもなる。星のタップ判定はまさにその微小角の領域を
 * 扱うため、外積の大きさと内積の atan2 を使う。全域で精度が落ちない。
 */
export const angleBetween = (a: Vec3, b: Vec3): number =>
  Math.atan2(length(cross(a, b)), dot(a, b)) * RAD;

/* --------------------------------------------------------------------------
 * クォータニオン
 * -------------------------------------------------------------------------- */

export const QUAT_IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };

export const quatNormalize = (q: Quat): Quat => {
  const n = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (!Number.isFinite(n) || n < 1e-9) return QUAT_IDENTITY;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
};

export const quatMultiply = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const quatConjugate = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

/** q が表す回転をベクトルに適用する（DEV → ENU）。 */
export const rotate = (q: Quat, v: Vec3): Vec3 => {
  // t = 2 * (q_vec × v);  v' = v + q_w * t + q_vec × t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return vec(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx),
  );
};

/** q の逆回転をベクトルに適用する（ENU → DEV）。 */
export const rotateInverse = (q: Quat, v: Vec3): Vec3 => rotate(quatConjugate(q), v);

/** 2 つの姿勢の差の角度（度）。追従の遅れやノイズ量の評価に使う。 */
export const quatAngleBetween = (a: Quat, b: Quat): number => {
  const d = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return 2 * Math.acos(Math.min(1, d)) * RAD;
};

/**
 * 球面線形補間。t = 0 で a、t = 1 で b。
 * 内積が負なら b を反転してから補間し、常に短い方の弧を通る。
 */
export const slerp = (a: Quat, b: Quat, t: number): Quat => {
  let cosHalf = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  let end = b;
  if (cosHalf < 0) {
    end = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
    cosHalf = -cosHalf;
  }
  // ほぼ同じ向きなら線形補間で十分（数値的にも安定）
  if (cosHalf > 0.9995) {
    return quatNormalize({
      w: a.w + (end.w - a.w) * t,
      x: a.x + (end.x - a.x) * t,
      y: a.y + (end.y - a.y) * t,
      z: a.z + (end.z - a.z) * t,
    });
  }
  const halfAngle = Math.acos(cosHalf);
  const sinHalf = Math.sin(halfAngle);
  const wa = Math.sin((1 - t) * halfAngle) / sinHalf;
  const wb = Math.sin(t * halfAngle) / sinHalf;
  return quatNormalize({
    w: a.w * wa + end.w * wb,
    x: a.x * wa + end.x * wb,
    y: a.y * wa + end.y * wb,
    z: a.z * wa + end.z * wb,
  });
};

/**
 * 回転行列からクォータニオンへ。
 * Shepperd (1978) の場合分けを使い、対角成分が小さいときの桁落ちを避ける。
 *
 * @param m 行優先 3x3。行がそれぞれ ENU の東・北・天頂を端末座標で表したもの。
 */
export const quatFromMat3 = (m: Mat3): Quat => {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return quatNormalize({
      w: 0.25 * s,
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
    });
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return quatNormalize({
      w: (m21 - m12) / s,
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
    });
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return quatNormalize({
      w: (m02 - m20) / s,
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
    });
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return quatNormalize({
    w: (m10 - m01) / s,
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
  });
};

/** 軸（単位ベクトル）と角度（ラジアン）から回転クォータニオン。 */
export const quatFromAxisAngle = (axis: Vec3, angleRad: number): Quat => {
  const half = angleRad / 2;
  const s = Math.sin(half);
  return { w: Math.cos(half), x: axis.x * s, y: axis.y * s, z: axis.z * s };
};

/**
 * 天頂軸まわりの回転を後から加える。方位のずれ（磁気偏角・手動補正）を
 * 姿勢そのものに焼き込まず、あとから足すために使う。
 *
 * @param q       DEV → 磁北基準 ENU
 * @param degrees 東向きを正とする回転量
 * @returns       DEV → 真北基準 ENU
 */
export const applyHeadingOffset = (q: Quat, degrees: number): Quat => {
  if (degrees === 0) return q;
  // ENU の方位角は北から東回り。方位角を +d するには ENU を天頂軸まわりに
  // −d ラジアン（数学的な反時計回りを正とする向き）回す。
  const spin = quatFromAxisAngle(vec(0, 0, 1), -degrees * DEG);
  return quatNormalize(quatMultiply(spin, q));
};
