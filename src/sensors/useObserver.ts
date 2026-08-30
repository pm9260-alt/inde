/**
 * 観測地（緯度・経度・標高）と現在時刻、そして磁気偏角を集める。
 *
 * 位置の精度について
 * ---------------------------------------------------------------------------
 * 星の見かけの位置は、観測地が 1 km ずれても 0.01° しか変わらない。
 * 表示誤差の目標 0.3° に対して十分小さいので、測位精度は最も粗い設定でよい。
 * 測位を粗くすると、電池の消費が減り、初回の取得も速くなる。
 *
 * 磁気偏角について
 * ---------------------------------------------------------------------------
 * 自前の姿勢推定が返すのは磁北基準の方位なので、真北へ直すには偏角が要る。
 * 偏角は expo-location の方位から得る。CoreLocation は真方位と磁方位の
 * 両方を返すので、その差がそのまま偏角になる（東京でおよそ −7.5°）。
 * 自前で地磁気モデル（WMM/IGRF）を持たずに済み、値は Apple のモデルに従う。
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ObserverLocation } from '../astro/sky';

/**
 * 位置が取れないときに使う既定地点（東京駅）。
 * 何も表示できないより、ずれていても星空を出して「位置情報が無い」と
 * 伝えるほうが、この体験では価値がある。
 */
export const FALLBACK_OBSERVER: ObserverLocation = {
  latitude: 35.6812,
  longitude: 139.7671,
  elevation: 3,
};

export type LocationStatus = 'pending' | 'granted' | 'denied' | 'fallback';

export interface ObserverState {
  readonly observer: ObserverLocation;
  readonly status: LocationStatus;
  /** 磁北から真北への補正（度・東が正）。得られていなければ null。 */
  readonly declination: number | null;
  /** コンパスの較正状態。3 が最良、0 以下は要較正。 */
  readonly headingAccuracy: number | null;
  readonly requestPermission: () => Promise<void>;
}

export const useObserver = (): ObserverState => {
  const [observer, setObserver] = useState<ObserverLocation>(FALLBACK_OBSERVER);
  const [status, setStatus] = useState<LocationStatus>('pending');
  const [declination, setDeclination] = useState<number | null>(null);
  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const subscriptions = useRef<Location.LocationSubscription[]>([]);

  const begin = useCallback(async (): Promise<void> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setStatus('fallback');
      return;
    }
    setStatus('granted');

    // 直前の測位結果があれば即座に使う。星空の表示を待たせない。
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      setObserver({
        latitude: last.coords.latitude,
        longitude: last.coords.longitude,
        elevation: last.coords.altitude ?? 0,
      });
    }

    const positionSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Lowest,
        // 1 km 動いても星の位置は 0.01° しか変わらない。
        distanceInterval: 1000,
        timeInterval: 60_000,
      },
      (position) => {
        setObserver({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevation: position.coords.altitude ?? 0,
        });
      },
    );
    subscriptions.current.push(positionSubscription);

    const headingSubscription = await Location.watchHeadingAsync((heading) => {
      setHeadingAccuracy(heading.accuracy);
      // 真方位が取れないときは -1 が返る。
      if (heading.trueHeading < 0) return;
      const difference = heading.trueHeading - heading.magHeading;
      // −180〜180 に正規化する。
      const normalized = ((difference + 540) % 360) - 180;
      setDeclination((previous) =>
        // 偏角は場所が変わらなければ動かない量なので、細かな揺れは無視する。
        previous != null && Math.abs(previous - normalized) < 0.25 ? previous : normalized,
      );
    });
    subscriptions.current.push(headingSubscription);
  }, []);

  useEffect(() => {
    void begin();
    return () => {
      for (const subscription of subscriptions.current) subscription.remove();
      subscriptions.current = [];
    };
  }, [begin]);

  const requestPermission = useCallback(async () => {
    setStatus('pending');
    await begin();
  }, [begin]);

  return { observer, status, declination, headingAccuracy, requestPermission };
};

/**
 * 一定間隔で現在時刻を返す。
 * 星は 1 分で 0.25° しか動かないので、毎フレーム計算し直す必要はない。
 */
export const useClock = (intervalMs = 20_000): Date => {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};
