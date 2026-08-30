/**
 * 星表（J2000 赤道座標）から、いま・ここでの地平方向を求める。
 *
 * 歳差・章動・地球の自転・観測地の緯度経度による変換はすべて
 * astronomy-engine (MIT) の Rotation_EQJ_HOR に委ねる。自前で近似しない。
 *   Rotation_EQJ_HOR が返す HOR 系は x = 北, y = 西, z = 天頂（ライブラリの
 *   ドキュメントに明記）なので、本アプリの ENU への変換は
 *   東 = −y, 北 = x, 天頂 = z で厳密に一致する。
 */
import {
  CombineRotation,
  MakeRotation,
  Observer as AstroObserver,
  Refraction,
  Rotation_EQJ_HOR,
} from 'astronomy-engine';

import { STAR_CATALOG, type CatalogStar } from '../data/stars.generated';
import { DEG, RAD, type Vec3, vec } from './math';

export interface ObserverLocation {
  /** 緯度（度）。北が正。 */
  readonly latitude: number;
  /** 経度（度）。東が正。 */
  readonly longitude: number;
  /** 標高（m）。 */
  readonly elevation: number;
}

/**
 * ある瞬間の空。星表と同じ順序で並ぶ。
 * 星の見かけの位置は 1 分で 0.25° しか動かないため、毎フレーム作り直さない。
 */
export interface SkySnapshot {
  readonly time: Date;
  readonly observer: ObserverLocation;
  /** 星ごとの ENU 単位ベクトル。3 要素ずつ。大気差補正済み。 */
  readonly directions: Float32Array;
  /** 星ごとの見かけの高度（度）。大気差補正済み。 */
  readonly altitudes: Float32Array;
  /** 星表のインデックスを HR 番号から引く。 */
  readonly indexByHr: ReadonlyMap<number, number>;
}

/** 星表の J2000 単位ベクトル。時刻に依らないので一度だけ作る。 */
const EQJ_UNIT_VECTORS: Float64Array = (() => {
  const out = new Float64Array(STAR_CATALOG.length * 3);
  STAR_CATALOG.forEach((star, i) => {
    const ra = star.ra * DEG;
    const dec = star.dec * DEG;
    const cosDec = Math.cos(dec);
    out[i * 3] = cosDec * Math.cos(ra);
    out[i * 3 + 1] = cosDec * Math.sin(ra);
    out[i * 3 + 2] = Math.sin(dec);
  });
  return out;
})();

const INDEX_BY_HR: ReadonlyMap<number, number> = new Map(
  STAR_CATALOG.map((star, i) => [star.hr, i]),
);

export const starIndexByHr = (hr: number): number => {
  const index = INDEX_BY_HR.get(hr);
  if (index === undefined) {
    throw new Error(`星表に HR ${hr} がありません。npm run build:catalog を確認してください。`);
  }
  return index;
};

export const starByHr = (hr: number): CatalogStar => STAR_CATALOG[starIndexByHr(hr)];

/**
 * HOR (x=北, y=西, z=天頂) を ENU (x=東, y=北, z=天頂) に読み替える行列。
 * 単なる軸の入れ替えなので、回転行列に畳み込んで星ごとの計算から外す。
 */
const HOR_TO_ENU = MakeRotation([
  // astronomy-engine の RotateVector は out[j] = Σ_i rot[i][j] * in[i] を計算する。
  // つまり第 1 添字が入力軸、第 2 添字が出力軸。
  // 出力 (東, 北, 天頂) を入力 (HOR x=北, y=西, z=天頂) で表すと
  //   東 = −y,  北 = x,  天頂 = z
  // なので、入力軸ごとの寄与は次のようになる。
  /* HOR x=北  → */ [0, 1, 0],
  /* HOR y=西  → */ [-1, 0, 0],
  /* HOR z=天頂 → */ [0, 0, 1],
]);

/**
 * 大気差で見かけの高度を持ち上げる。
 * astronomy-engine の Refraction は Meeus (1991) の Saemundsson 式で、
 * 天底付近まで安全に定義されているため高度で場合分けせずそのまま使う。
 * 地平線上で約 34 分角、高度 30° で約 1.6 分角。
 */
const applyRefraction = (east: number, north: number, up: number): Vec3 => {
  const geometricAlt = Math.asin(Math.max(-1, Math.min(1, up))) * RAD;
  const lift = Refraction('normal', geometricAlt);
  if (lift === 0) return vec(east, north, up);
  const apparentAlt = (geometricAlt + lift) * DEG;
  const horizontal = Math.hypot(east, north);
  if (horizontal < 1e-9) return vec(east, north, up);
  const s = Math.cos(apparentAlt) / horizontal;
  return vec(east * s, north * s, Math.sin(apparentAlt));
};

/** いまの空を計算する。星表全件で 1 ミリ秒程度。 */
export const computeSkySnapshot = (
  observer: ObserverLocation,
  time: Date,
): SkySnapshot => {
  const astroObserver = new AstroObserver(observer.latitude, observer.longitude, observer.elevation);
  // EQJ → HOR を適用してから HOR → ENU を適用する。
  const eqjToEnu = CombineRotation(Rotation_EQJ_HOR(time, astroObserver), HOR_TO_ENU);

  const count = STAR_CATALOG.length;
  const directions = new Float32Array(count * 3);
  const altitudes = new Float32Array(count);

  // 星ごとに Vector を作ると 900 個のオブジェクトが毎回生まれるので、
  // 回転行列を展開して直接掛ける。要素の並びは astronomy-engine の
  // RotateVector と同じ規約（out[j] = Σ_i rot[i][j] * in[i]）。
  // この規約が正しいことは src/astro/sky.test.ts がライブラリ本体の
  // 高水準 API と突き合わせて検証している。
  const r = eqjToEnu.rot;
  const [r00, r01, r02] = r[0];
  const [r10, r11, r12] = r[1];
  const [r20, r21, r22] = r[2];

  for (let i = 0; i < count; i += 1) {
    const vx = EQJ_UNIT_VECTORS[i * 3];
    const vy = EQJ_UNIT_VECTORS[i * 3 + 1];
    const vz = EQJ_UNIT_VECTORS[i * 3 + 2];
    const apparent = applyRefraction(
      r00 * vx + r10 * vy + r20 * vz,
      r01 * vx + r11 * vy + r21 * vz,
      r02 * vx + r12 * vy + r22 * vz,
    );
    directions[i * 3] = apparent.x;
    directions[i * 3 + 1] = apparent.y;
    directions[i * 3 + 2] = apparent.z;
    altitudes[i] = Math.asin(Math.max(-1, Math.min(1, apparent.z))) * RAD;
  }

  return { time, observer, directions, altitudes, indexByHr: INDEX_BY_HR };
};

/** スナップショットから 1 星の ENU 方向を取り出す。 */
export const directionAt = (snapshot: SkySnapshot, index: number): Vec3 =>
  vec(
    snapshot.directions[index * 3],
    snapshot.directions[index * 3 + 1],
    snapshot.directions[index * 3 + 2],
  );
