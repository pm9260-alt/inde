/**
 * 「いまの空」をひとまとめにする。
 *
 * 星の位置は 1 分で 0.25° しか動かないので、計算は時計の刻み（既定 20 秒）
 * ごとに一度だけ。毎フレームやるのは姿勢の反映と描画だけにする。
 */
import { useMemo } from 'react';

import { directionAt, computeSkySnapshot, starIndexByHr, type ObserverLocation, type SkySnapshot } from '../astro/sky';
import { azimuthOf, type Vec3 } from '../astro/math';
import {
  computeSkyConditions,
  starVisibility,
  zenithLimitingMagnitude,
  type SkyConditions,
  type SkyEnvironment,
} from '../astro/visibility';
import { ASTERISMS } from '../data/constellations';
import { STAR_CATALOG } from '../data/stars.generated';

/** 星座線 1 本ぶん。端点は ENU の単位ベクトル。 */
export interface AsterismSegment {
  readonly asterismId: string;
  readonly from: Vec3;
  readonly to: Vec3;
}

export interface SkyModel {
  readonly snapshot: SkySnapshot;
  readonly conditions: SkyConditions;
  /** 星表と同じ並びの「見えやすさ」（0〜1）。 */
  readonly brightness: Float32Array;
  readonly segments: readonly AsterismSegment[];
  /** 天頂での肉眼極限等級。「いまの空は何等星まで」の表示に使う。 */
  readonly limitingMagnitude: number;
}

/**
 * 見えない星の描き方。
 * onlyVisibleStars が false のときは、極限等級を下回る星もこの割合で薄く描く。
 * 完全に消すと空が寂しくなり、そのまま描くと現実と食い違う。
 */
const FAINT_STAR_FLOOR = 0.16;

export const useSkyModel = (
  observer: ObserverLocation,
  time: Date,
  environment: SkyEnvironment,
  onlyVisibleStars: boolean,
): SkyModel => {
  const snapshot = useMemo(() => computeSkySnapshot(observer, time), [observer, time]);

  const conditions = useMemo(
    () => computeSkyConditions(observer, time, environment),
    [observer, time, environment],
  );

  const brightness = useMemo(() => {
    const values = new Float32Array(STAR_CATALOG.length);
    for (let i = 0; i < STAR_CATALOG.length; i += 1) {
      const altitude = snapshot.altitudes[i];
      if (altitude < -1) continue;
      const visibility = starVisibility(
        STAR_CATALOG[i].mag,
        altitude,
        azimuthOf(directionAt(snapshot, i)),
        conditions,
      );
      values[i] = onlyVisibleStars
        ? visibility.confidence
        : Math.max(visibility.confidence, FAINT_STAR_FLOOR);
    }
    return values;
  }, [snapshot, conditions, onlyVisibleStars]);

  const segments = useMemo(() => {
    const list: AsterismSegment[] = [];
    for (const asterism of ASTERISMS) {
      for (const [a, b] of asterism.lines) {
        list.push({
          asterismId: asterism.id,
          from: directionAt(snapshot, starIndexByHr(a)),
          to: directionAt(snapshot, starIndexByHr(b)),
        });
      }
    }
    return list;
  }, [snapshot]);

  const limitingMagnitude = useMemo(() => zenithLimitingMagnitude(conditions), [conditions]);

  return { snapshot, conditions, brightness, segments, limitingMagnitude };
};
