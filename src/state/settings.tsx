/**
 * 利用者ごとの設定。端末に保存する。
 *
 * 較正の値（画角・方位補正）は、一度合わせたら次回も同じであってほしい。
 * 逆に、空の状態（光害の程度）は場所によって変わるので、変えやすい位置に
 * 置きつつ前回値を覚えておく。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_VERTICAL_FOV_DEG } from '../astro/projection';
import type { SkyEnvironment } from '../astro/visibility';
import { DEMO_MODE_AVAILABLE } from '../config/featureFlags';

const STORAGE_KEY = 'hoshimeguri.settings.v1';

export interface Settings {
  /** カメラの垂直画角（度）。機種差と Apple の公表値の曖昧さを吸収する。 */
  readonly verticalFovDeg: number;
  /** 利用者が手で加える方位の補正（度・東が正）。磁気偏角とは別に足される。 */
  readonly headingOffsetDeg: number;
  /** 空の明るさの想定。 */
  readonly environment: SkyEnvironment;
  /** 肉眼で見えそうな星だけを描くか。false なら暗い星もうっすら描く。 */
  readonly onlyVisibleStars: boolean;
  /**
   * デモモード。実際の季節・時刻・現在地を無視して、端末を上へ向けるだけで
   * オリオン座が視野に現れる。開発ビルドでのみ使える。
   */
  readonly demoMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  verticalFovDeg: DEFAULT_VERTICAL_FOV_DEG,
  headingOffsetDeg: 0,
  environment: 'city',
  onlyVisibleStars: true,
  demoMode: false,
};

interface SettingsContextValue {
  readonly settings: Settings;
  readonly update: (patch: Partial<Settings>) => void;
  readonly reset: () => void;
  /** 保存済みの値を読み込み終えたか。読み込み前は既定値が入っている。 */
  readonly loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && stored) {
          const parsed = JSON.parse(stored) as Partial<Settings>;
          setSettings((current) => sanitize({ ...current, ...parsed }));
        }
      } catch {
        // 保存領域が読めなくても既定値で動く。設定のために起動を止めない。
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = sanitize({ ...current, ...patch });
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // 書き込みに失敗しても、その回の操作は画面に反映されている。
      });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ settings, update, reset, loaded }),
    [settings, update, reset, loaded],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('SettingsProvider の内側で使ってください');
  return value;
};

/** 保存された値が壊れていても破綻しないよう、範囲に収める。 */
const sanitize = (settings: Settings): Settings => ({
  verticalFovDeg: clamp(settings.verticalFovDeg, 40, 100, DEFAULT_SETTINGS.verticalFovDeg),
  headingOffsetDeg: clamp(settings.headingOffsetDeg, -30, 30, 0),
  environment: (['city', 'suburb', 'rural', 'dark'] as const).includes(settings.environment)
    ? settings.environment
    : DEFAULT_SETTINGS.environment,
  onlyVisibleStars:
    typeof settings.onlyVisibleStars === 'boolean'
      ? settings.onlyVisibleStars
      : DEFAULT_SETTINGS.onlyVisibleStars,
  // デモを含まないビルドでは、保存値がどうであれ必ず切る。
  demoMode: DEMO_MODE_AVAILABLE && settings.demoMode === true,
});

const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
