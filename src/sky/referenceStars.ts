/**
 * 精度を確かめるときの基準になる星を選ぶ。
 *
 * 条件は 3 つ。
 *   ・肉眼ですぐ見つかるほど明るい
 *   ・地平線から十分に離れている（低空は大気差と建物の影響を受ける）
 *   ・名前がある（口頭で言えないと確認作業にならない）
 */
import { altitudeOf, azimuthOf } from '../astro/math';
import { directionAt, type SkySnapshot } from '../astro/sky';
import { STAR_CATALOG } from '../data/stars.generated';

export interface ReferenceStar {
  readonly hr: number;
  readonly name: string;
  readonly magnitude: number;
  readonly altitudeDeg: number;
  readonly azimuthDeg: number;
  /** 星表の中の位置。方向ベクトルを引くのに使う。 */
  readonly index: number;
}

/** これより暗い星は、都市の空では基準にしづらい。 */
const MAX_MAGNITUDE = 2.2;
/** これより低い星は、大気差と建物にかかる。 */
const MIN_ALTITUDE_DEG = 20;

export const brightReferenceStars = (
  snapshot: SkySnapshot,
  limit = 8,
): readonly ReferenceStar[] => {
  const found: ReferenceStar[] = [];
  for (let index = 0; index < STAR_CATALOG.length; index += 1) {
    const star = STAR_CATALOG[index];
    if (!star.name || star.mag > MAX_MAGNITUDE) continue;
    const altitudeDeg = snapshot.altitudes[index];
    if (altitudeDeg < MIN_ALTITUDE_DEG) continue;
    found.push({
      hr: star.hr,
      name: star.name,
      magnitude: star.mag,
      altitudeDeg,
      azimuthDeg: azimuthOf(directionAt(snapshot, index)),
      index,
    });
  }
  // 明るい順。見つけやすさが第一。
  found.sort((a, b) => a.magnitude - b.magnitude);
  return found.slice(0, limit);
};

/** 高度が実際に方向ベクトルと合っているかの確認に使う。 */
export const referenceStarAltitude = (snapshot: SkySnapshot, star: ReferenceStar): number =>
  altitudeOf(directionAt(snapshot, star.index));
