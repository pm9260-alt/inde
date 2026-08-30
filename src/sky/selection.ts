/**
 * 「いま、どの星座に向けているか」の判定。
 *
 * 星座を選ぶのにボタンを並べたくない。夜空にかざしている端末を、その星座の
 * ほうへ向ける。それだけで選択が済むのが自然だと考えた。
 * 画面の中央に近い星座がひとつだけ候補になり、その名前が静かに現れる。
 */
import {
  angleBetween,
  normalize,
  vec,
  type Quat,
  type Vec3,
} from '../astro/math';
import { viewingDirection } from '../astro/projection';
import { directionAt, starIndexByHr, type SkySnapshot } from '../astro/sky';
import { ASTERISMS, asterismStarHrs, type Asterism } from '../data/constellations';

/**
 * 星座の中心方向（構成星の平均方向）。
 * 単純な平均でよい。星座はどれも空の一部にまとまっているので、
 * 平均ベクトルが 0 になるような配置は起こらない。
 */
export const asterismCenter = (snapshot: SkySnapshot, asterism: Asterism): Vec3 => {
  let x = 0;
  let y = 0;
  let z = 0;
  const hrs = asterismStarHrs(asterism);
  for (const hr of hrs) {
    const d = directionAt(snapshot, starIndexByHr(hr));
    x += d.x;
    y += d.y;
    z += d.z;
  }
  return normalize(vec(x, y, z)) ?? vec(0, 0, 1);
};

/** 星座の広がり（中心から最も遠い星までの角度、度）。 */
export const asterismRadius = (snapshot: SkySnapshot, asterism: Asterism): number => {
  const center = asterismCenter(snapshot, asterism);
  let widest = 0;
  for (const hr of asterismStarHrs(asterism)) {
    widest = Math.max(widest, angleBetween(center, directionAt(snapshot, starIndexByHr(hr))));
  }
  return widest;
};

export interface AimResult {
  readonly asterism: Asterism;
  /** 画面中央からの角度（度）。 */
  readonly offsetDeg: number;
  /** 星座の中心が地平線より上にあるか。 */
  readonly aboveHorizon: boolean;
}

/**
 * 端末が向いている先にある星座を返す。無ければ null。
 *
 * @param toleranceDeg 画面中央からこの角度までを「向けている」とみなす。
 *   画角の半分あたりが自然。狭すぎると狙いを定めにくく、広すぎると
 *   隣の星座まで拾ってしまう。
 */
export const aimedAsterism = (
  snapshot: SkySnapshot,
  attitude: Quat,
  toleranceDeg: number,
  asterisms: readonly Asterism[] = ASTERISMS,
): AimResult | null => {
  const forward = viewingDirection(attitude);
  let best: AimResult | null = null;

  for (const asterism of asterisms) {
    const center = asterismCenter(snapshot, asterism);
    // 地平線の下にある星座は、地面の向こうにあるので選べない。
    if (center.z < -0.05) continue;

    const offsetDeg = angleBetween(forward, center);
    // 大きな星座は中心を外していても図の中に入っている。広がりぶんを見込む。
    const allowance = toleranceDeg + asterismRadius(snapshot, asterism) * 0.5;
    if (offsetDeg > allowance) continue;

    if (!best || offsetDeg < best.offsetDeg) {
      best = { asterism, offsetDeg, aboveHorizon: center.z >= 0 };
    }
  }
  return best;
};
