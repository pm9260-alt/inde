/**
 * 姿勢を React から使うためのフック。
 *
 * 姿勢は毎秒 60 回更新される。これを React の状態にすると再描画で埋もれるので、
 *   ・描画に使う値は ref に書き込むだけ（再描画を起こさない）
 *   ・UI に出す情報（精度・方位の読み）は間引いて状態にする
 * と分けている。
 *
 * どの経路を使うかもここで決める。要求された経路が使えなかったり、
 * 動き出さなかったりしたときは、静かに下位の経路へ落ちる。落ちたことは
 * 状態に残すので、診断画面で確認できる。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { QUAT_IDENTITY, type Quat } from '../astro/math';
import { ArkitOrientationProvider, isArkitAvailable } from './ArkitOrientationProvider';
import type { AttitudeCorrection } from './corrections';
import { FusionOrientationProvider } from './FusionOrientationProvider';
import { isNativeAttitudeAvailable, NativeOrientationProvider } from './NativeOrientationProvider';
import type { OrientationAccuracy, OrientationProvider } from './orientationProvider';

/** UI に出す情報を更新する間隔（ミリ秒）。読めればよいので粗くてよい。 */
const STATUS_INTERVAL_MS = 250;

/**
 * 選んだ経路がこの時間内に姿勢を出さなければ、下位の経路へ落ちる。
 * ARKit は追跡が始まるまで少し待つので、短すぎると誤って落ちる。
 */
const START_TIMEOUT_MS = 5000;

export type AttitudeSource = 'auto' | 'fusion' | 'native' | 'arkit';
export type ResolvedSource = 'fusion' | 'native' | 'arkit';

export interface OrientationStatus {
  readonly ready: boolean;
  readonly accuracy: OrientationAccuracy;
  /** 実際に動いている経路。 */
  readonly source: ResolvedSource | null;
  /** 要求された経路。auto のときは解決結果と異なる。 */
  readonly requested: AttitudeSource;
  readonly fieldMagnitude: number;
  /** ARKit の追跡状態。ほかの経路では null。 */
  readonly trackingState: string | null;
  /** 重力による座標系の検算（度）。ARKit 経路のみ。 */
  readonly gravityErrorDeg: number | null;
  /** カメラ映像を ARKit 側のビューから出す必要があるか。 */
  readonly usesArCamera: boolean;
  /** 下位の経路へ落ちた理由。落ちていなければ null。 */
  readonly fallbackReason: string | null;
}

const INITIAL_STATUS: OrientationStatus = {
  ready: false,
  accuracy: 'unavailable',
  source: null,
  requested: 'auto',
  fieldMagnitude: 0,
  trackingState: null,
  gravityErrorDeg: null,
  usesArCamera: false,
  fallbackReason: null,
};

export interface UseOrientationResult {
  /** 最新の姿勢。毎フレーム読むこと。再描画は起きない。 */
  readonly attitudeRef: React.RefObject<Quat>;
  readonly status: OrientationStatus;
  /** どの経路が、このビルドで使えるか。 */
  readonly availableSources: readonly ResolvedSource[];
}

/** このビルドで使える経路を、精度の高い順に並べる。 */
export const availableAttitudeSources = (): readonly ResolvedSource[] => {
  const sources: ResolvedSource[] = [];
  if (isArkitAvailable()) sources.push('arkit');
  if (isNativeAttitudeAvailable()) sources.push('native');
  sources.push('fusion');
  return sources;
};

/** 要求から、実際に試す経路の順序を作る。先頭がだめなら次を試す。 */
const resolveChain = (requested: AttitudeSource): readonly ResolvedSource[] => {
  const available = availableAttitudeSources();
  if (requested === 'auto') return available;
  // 名指しされた経路を先頭に、残りを控えとして後ろへ。
  return available.includes(requested)
    ? [requested, ...available.filter((s) => s !== requested)]
    : available;
};

const createProvider = (source: ResolvedSource): OrientationProvider => {
  switch (source) {
    case 'arkit':
      return new ArkitOrientationProvider();
    case 'native':
      return new NativeOrientationProvider();
    default:
      return new FusionOrientationProvider();
  }
};

export interface UseOrientationOptions {
  readonly correction: AttitudeCorrection;
  readonly enabled?: boolean;
  /** 方位が実際の方角と合っている必要がないか（デモ）。 */
  readonly headingFree?: boolean;
  /** 使いたい経路。 */
  readonly requested?: AttitudeSource;
}

export const useOrientation = ({
  correction,
  enabled = true,
  headingFree = false,
  requested = 'auto',
}: UseOrientationOptions): UseOrientationResult => {
  const attitudeRef = useRef<Quat>(QUAT_IDENTITY);
  const [status, setStatus] = useState<OrientationStatus>(INITIAL_STATUS);
  /** いま試している経路の、chain の中の位置。 */
  const [attempt, setAttempt] = useState(0);

  const chain = useMemo(() => resolveChain(requested), [requested]);
  const availableSources = useMemo(() => availableAttitudeSources(), []);

  // 要求が変わったら、また先頭から試す。
  useEffect(() => setAttempt(0), [requested]);

  const active = chain[Math.min(attempt, chain.length - 1)] ?? 'fusion';
  const provider = useMemo(() => createProvider(active), [active]);

  useEffect(() => {
    provider.setCorrection(correction);
  }, [provider, correction]);

  useEffect(() => {
    provider.setHeadingFree(headingFree);
  }, [provider, headingFree]);

  const advance = useCallback(
    (reason: string) => {
      setAttempt((current) => {
        if (current + 1 >= chain.length) return current;
        setStatus((previous) => ({ ...previous, fallbackReason: reason }));
        return current + 1;
      });
    },
    [chain.length],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus(INITIAL_STATUS);
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;
    // 直近の値を溜めておき、一定間隔でだけ React に渡す。
    let latestAccuracy: OrientationAccuracy = 'unavailable';
    let latestField = 0;
    let latestTracking: string | null = null;
    let latestGravityError: number | null = null;
    let received = false;

    const timer = setInterval(() => {
      setStatus((previous) => {
        const next: OrientationStatus = {
          ready: received,
          accuracy: latestAccuracy,
          source: active,
          requested,
          fieldMagnitude: latestField,
          trackingState: latestTracking,
          gravityErrorDeg: latestGravityError,
          usesArCamera: active === 'arkit',
          fallbackReason: previous.fallbackReason,
        };
        return shallowEqual(previous, next) ? previous : next;
      });
    }, STATUS_INTERVAL_MS);

    // 選んだ経路が動き出さないときは、下位へ落とす。
    const watchdog = setTimeout(() => {
      if (!received && !cancelled) {
        advance(`${active} が応答しませんでした`);
      }
    }, START_TIMEOUT_MS);

    void (async () => {
      let available = false;
      try {
        available = await provider.isAvailable();
      } catch {
        available = false;
      }
      if (cancelled) return;
      if (!available) {
        advance(`${active} はこの端末・ビルドでは使えません`);
        return;
      }
      try {
        const unsubscribe = await provider.start((sample) => {
          attitudeRef.current = sample.attitude;
          latestAccuracy = sample.accuracy;
          latestField = sample.fieldMagnitude;
          latestTracking = sample.trackingState ?? null;
          latestGravityError = sample.gravityErrorDeg ?? null;
          received = true;
        });
        if (cancelled) {
          unsubscribe();
          return;
        }
        stop = unsubscribe;
      } catch (error) {
        if (!cancelled) advance(`${active} の起動に失敗しました: ${String(error)}`);
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(watchdog);
      stop?.();
    };
  }, [provider, active, enabled, advance, requested]);

  return { attitudeRef, status, availableSources };
};

const shallowEqual = (a: OrientationStatus, b: OrientationStatus): boolean =>
  a.ready === b.ready &&
  a.accuracy === b.accuracy &&
  a.source === b.source &&
  a.requested === b.requested &&
  a.trackingState === b.trackingState &&
  a.usesArCamera === b.usesArCamera &&
  a.fallbackReason === b.fallbackReason &&
  Math.abs(a.fieldMagnitude - b.fieldMagnitude) < 0.5 &&
  Math.abs((a.gravityErrorDeg ?? -1) - (b.gravityErrorDeg ?? -1)) < 0.2;
