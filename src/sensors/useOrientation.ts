/**
 * 姿勢を React から使うためのフック。
 *
 * 姿勢は毎秒 60 回更新される。これを React の状態にすると再描画で埋もれるので、
 *   ・描画に使う値は ref に書き込むだけ（再描画を起こさない）
 *   ・UI に出す情報（精度・方位の読み）は間引いて状態にする
 * と分けている。
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { QUAT_IDENTITY, type Quat } from '../astro/math';
import { FusionOrientationProvider } from './FusionOrientationProvider';
import { isNativeAttitudeAvailable, NativeOrientationProvider } from './NativeOrientationProvider';
import type { OrientationAccuracy, OrientationProvider } from './orientationProvider';

/** UI に出す情報を更新する間隔（ミリ秒）。読めればよいので粗くてよい。 */
const STATUS_INTERVAL_MS = 250;

export interface OrientationStatus {
  readonly ready: boolean;
  readonly accuracy: OrientationAccuracy;
  readonly source: OrientationProvider['id'] | null;
  readonly fieldMagnitude: number;
}

const INITIAL_STATUS: OrientationStatus = {
  ready: false,
  accuracy: 'unavailable',
  source: null,
  fieldMagnitude: 0,
};

export interface UseOrientationResult {
  /** 最新の姿勢。毎フレーム読むこと。再描画は起きない。 */
  readonly attitudeRef: React.RefObject<Quat>;
  readonly status: OrientationStatus;
}

/**
 * @param declinationDeg   磁北から真北へのずれ（度・東が正）。不明なら 0。
 * @param manualOffsetDeg  利用者が手で加える補正（度・東が正）
 * @param enabled          画面が前面にあるあいだだけ true にする
 * @param headingFree      方位が実際の方角と合っている必要がないか（デモ）
 */
export const useOrientation = (
  declinationDeg: number,
  manualOffsetDeg: number,
  enabled = true,
  headingFree = false,
): UseOrientationResult => {
  const attitudeRef = useRef<Quat>(QUAT_IDENTITY);
  const [status, setStatus] = useState<OrientationStatus>(INITIAL_STATUS);

  // ネイティブ実装があればそちらを優先する。無ければ Expo Go でも動く実装。
  const provider = useMemo<OrientationProvider>(
    () =>
      isNativeAttitudeAvailable()
        ? new NativeOrientationProvider()
        : new FusionOrientationProvider(),
    [],
  );

  useEffect(() => {
    provider.setHeadingCorrection(declinationDeg, manualOffsetDeg);
  }, [provider, declinationDeg, manualOffsetDeg]);

  useEffect(() => {
    provider.setHeadingFree(headingFree);
  }, [provider, headingFree]);

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
    let received = false;

    const timer = setInterval(() => {
      setStatus((previous) => {
        if (
          previous.ready === received &&
          previous.accuracy === latestAccuracy &&
          Math.abs(previous.fieldMagnitude - latestField) < 0.5
        ) {
          return previous;
        }
        return {
          ready: received,
          accuracy: latestAccuracy,
          source: provider.id,
          fieldMagnitude: latestField,
        };
      });
    }, STATUS_INTERVAL_MS);

    void (async () => {
      const available = await provider.isAvailable();
      if (cancelled) return;
      if (!available) {
        setStatus({ ...INITIAL_STATUS, source: provider.id });
        return;
      }
      const unsubscribe = await provider.start((sample) => {
        attitudeRef.current = sample.attitude;
        latestAccuracy = sample.accuracy;
        latestField = sample.fieldMagnitude;
        received = true;
      });
      if (cancelled) {
        unsubscribe();
        return;
      }
      stop = unsubscribe;
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
      stop?.();
    };
  }, [provider, enabled]);

  return { attitudeRef, status };
};
