/**
 * デモ用の空。
 *
 * 昼でも屋内でも、季節も現在地も関係なく、端末を上へ向けるだけで
 * オリオン座が視野の中に現れるようにする。人に見せるときと、
 * 開発中に演出を何度も見直すときのためのもの。
 *
 * 作り方
 * ---------------------------------------------------------------------------
 * 星の位置を作り話にはしない。星どうしの角距離は観測地や時刻によらず
 * 一定なので、**実際の星空をそのまま剛体回転させて**、対象の星座が
 * 端末の向いている先に来るようにする。星座の形も、星の色も、周囲の
 * 星の並びも、すべて本物のまま。動かしているのは「空全体の向き」だけ。
 *
 * 基準にするのは、東京から 2026 年 1 月 15 日 21 時に見える空。
 * オリオン座が南東の高い位置にあり、最も見慣れた姿になる時刻。
 * ここを固定することで、いつどこで起動しても同じ絵が出る。
 *
 * 回転は、星座の中心を端末が向いている先へ移し、そのとき星座の
 * 「天頂に対する傾き」を保つように決める。こうすると、置き直しても
 * 逆さまになったり寝てしまったりしない。
 */
import { dot, normalize, scale, sub, vec, type Vec3 } from '../astro/math';
import { computeSkySnapshot, directionAt, starIndexByHr, type SkySnapshot } from '../astro/sky';
import type { SkyConditions, SkyEnvironment } from '../astro/visibility';
import { asterismById, asterismStarHrs, type Asterism } from '../data/constellations';

/** デモで見せる星座。 */
export const DEMO_ASTERISM_ID = 'orion';

/**
 * 基準にする観測地と時刻。東京、2026 年 1 月 15 日 21 時（JST）。
 * オリオン座が南東の空に高く、三つ星が水平に近い、最も見慣れた姿。
 */
export const DEMO_REFERENCE = {
  observer: { latitude: 35.6812, longitude: 139.7671, elevation: 40 },
  time: new Date('2026-01-15T12:00:00Z'),
} as const;

/**
 * デモの空の明るさ。実際の天候や時刻を無視して固定する。
 * 郊外相当。暗すぎると星が多すぎて星座が読み取りにくく、
 * 明るすぎると背景が寂しくなる。
 */
export const DEMO_ENVIRONMENT: SkyEnvironment = 'suburb';

/** 太陽も月も出ていない夜として扱う。 */
export const DEMO_CONDITIONS: SkyConditions = {
  sunAltitude: -40,
  moonAltitude: -30,
  moonAzimuth: 0,
  moonPhaseAngle: 90,
  moonIllumination: 0.5,
  environment: DEMO_ENVIRONMENT,
};

let cachedReference: SkySnapshot | null = null;

/** 基準となる空。一度だけ計算して使い回す。 */
export const referenceSnapshot = (): SkySnapshot => {
  cachedReference ??= computeSkySnapshot(DEMO_REFERENCE.observer, DEMO_REFERENCE.time);
  return cachedReference;
};

/** 方向ベクトルの接平面に「上」（天頂側）を作る。 */
const tangentUp = (direction: Vec3): Vec3 | null => {
  const zenith = vec(0, 0, 1);
  const projected = sub(zenith, scale(direction, dot(zenith, direction)));
  return (
    normalize(projected) ??
    // 真上・真下を向いていて天頂側が定まらないときは北を使う。
    normalize(sub(vec(0, 1, 0), scale(direction, dot(vec(0, 1, 0), direction))))
  );
};

/** 方向ベクトルまわりの正規直交基底（右, 上, 前）。 */
const frameAt = (direction: Vec3): readonly [Vec3, Vec3, Vec3] | null => {
  const up = tangentUp(direction);
  if (!up) return null;
  const right = vec(
    up.y * direction.z - up.z * direction.y,
    up.z * direction.x - up.x * direction.z,
    up.x * direction.y - up.y * direction.x,
  );
  return [right, up, direction];
};

/** 星座の構成星の平均方向。 */
const centerOf = (snapshot: SkySnapshot, asterism: Asterism): Vec3 | null => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const hr of asterismStarHrs(asterism)) {
    const d = directionAt(snapshot, starIndexByHr(hr));
    x += d.x;
    y += d.y;
    z += d.z;
  }
  return normalize(vec(x, y, z));
};

/**
 * 基準の空を、対象の星座が anchor の方向に来るよう剛体回転させた空を返す。
 * 回転できない（基準が退化している）場合は基準の空をそのまま返す。
 */
export const placedSnapshot = (anchor: Vec3, asterismId = DEMO_ASTERISM_ID): SkySnapshot => {
  const reference = referenceSnapshot();
  const asterism = asterismById(asterismId);

  const source = centerOf(reference, asterism);
  const target = normalize(anchor);
  if (!source || !target) return reference;

  const sourceFrame = frameAt(source);
  const targetFrame = frameAt(target);
  if (!sourceFrame || !targetFrame) return reference;

  // 回転は 3 つの外積の和として書ける。
  //   R v = Σ_k (s_k・v) t_k
  // 行列を組まずに済み、星ごとの計算も内積 3 回で終わる。
  const [s0, s1, s2] = sourceFrame;
  const [t0, t1, t2] = targetFrame;

  const count = reference.altitudes.length;
  const directions = new Float32Array(count * 3);
  const altitudes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const vx = reference.directions[i * 3];
    const vy = reference.directions[i * 3 + 1];
    const vz = reference.directions[i * 3 + 2];

    const a = s0.x * vx + s0.y * vy + s0.z * vz;
    const b = s1.x * vx + s1.y * vy + s1.z * vz;
    const c = s2.x * vx + s2.y * vy + s2.z * vz;

    const x = t0.x * a + t1.x * b + t2.x * c;
    const y = t0.y * a + t1.y * b + t2.y * c;
    const z = t0.z * a + t1.z * b + t2.z * c;

    directions[i * 3] = x;
    directions[i * 3 + 1] = y;
    directions[i * 3 + 2] = z;
    altitudes[i] = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI);
  }

  return {
    time: reference.time,
    observer: reference.observer,
    directions,
    altitudes,
    indexByHr: reference.indexByHr,
  };
};
