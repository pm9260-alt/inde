/**
 * 「いまの空」をひとまとめにする。
 *
 * 星の位置は 1 分で 0.25° しか動かないので、計算は時計の刻み（既定 20 秒）
 * ごとに一度だけ。毎フレームやるのは姿勢の反映と描画だけにする。
 *
 * 空の出どころは 2 つある。
 *   live … 実際の観測地・時刻から計算する。本番。
 *   demo … 基準の空を剛体回転させて、対象の星座を指定方向へ置く。
 *          季節も時刻も天候も関係なく同じ絵が出る。
 * どちらも同じ SkyModel を返すので、これより先（描画・選択・演出）は
 * まったく同じコードを通る。
 */
import { useMemo } from 'react';

import { azimuthOf, type Vec3 } from '../astro/math';
import {
  computeSkySnapshot,
  directionAt,
  starIndexByHr,
  type ObserverLocation,
  type SkySnapshot,
} from '../astro/sky';
import {
  computeSkyConditions,
  starVisibility,
  zenithLimitingMagnitude,
  type SkyConditions,
  type SkyEnvironment,
} from '../astro/visibility';
import { ASTERISMS } from '../data/constellations';
import { STAR_CATALOG } from '../data/stars.generated';
import { DEMO_CONDITIONS, placedSnapshot } from './demoSky';

/** 星座線 1 本ぶん。端点は ENU の単位ベクトル。 */
export interface AsterismSegment {
  readonly asterismId: string;
  /** その星座の lines の中での位置。演出の順序に対応する。 */
  readonly indexInAsterism: number;
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
  /** デモの空か。表示の注記に使う。 */
  readonly isDemo: boolean;
}

/** 空の出どころ。 */
export type SkySource =
  | {
      readonly kind: 'live';
      readonly observer: ObserverLocation;
      readonly time: Date;
      readonly environment: SkyEnvironment;
      readonly onlyVisibleStars: boolean;
    }
  | {
      readonly kind: 'demo';
      /** 対象の星座を置く方向（ENU）。 */
      readonly anchor: Vec3;
    };

/**
 * 見えない星の描き方。
 * onlyVisibleStars が false のときは、極限等級を下回る星もこの割合で薄く描く。
 * 完全に消すと空が寂しくなり、そのまま描くと現実と食い違う。
 */
const FAINT_STAR_FLOOR = 0.16;

export const useSkyModel = (source: SkySource): SkyModel => {
  const isDemo = source.kind === 'demo';
  const anchor = source.kind === 'demo' ? source.anchor : null;
  const observer = source.kind === 'live' ? source.observer : null;
  const time = source.kind === 'live' ? source.time : null;
  const environment = source.kind === 'live' ? source.environment : null;
  const onlyVisibleStars = source.kind === 'live' ? source.onlyVisibleStars : true;

  const snapshot = useMemo(
    () =>
      anchor ? placedSnapshot(anchor) : computeSkySnapshot(observer!, time!),
    [anchor, observer, time],
  );

  const conditions = useMemo(
    () =>
      isDemo ? DEMO_CONDITIONS : computeSkyConditions(observer!, time!, environment!),
    [isDemo, observer, time, environment],
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
      asterism.lines.forEach(([a, b], indexInAsterism) => {
        list.push({
          asterismId: asterism.id,
          indexInAsterism,
          from: directionAt(snapshot, starIndexByHr(a)),
          to: directionAt(snapshot, starIndexByHr(b)),
        });
      });
    }
    return list;
  }, [snapshot]);

  const limitingMagnitude = useMemo(() => zenithLimitingMagnitude(conditions), [conditions]);

  // 返す入れ物そのものの同一性も保つ。描画側は model が変わったときに
  // 星の頂点バッファを送り直すので、毎レンダー作り直すと無駄が出る。
  return useMemo(
    () => ({ snapshot, conditions, brightness, segments, limitingMagnitude, isDemo }),
    [snapshot, conditions, brightness, segments, limitingMagnitude, isDemo],
  );
};
