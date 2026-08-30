/**
 * スカイビュー。このアプリの本体。
 *
 * 画面の構成は「カメラ映像 → 星空 → 必要なときだけ現れる文字」の 3 層。
 * 既定の状態では、文字は 1 つも出ていない。
 *
 * 演出の流れは本番もデモも同じ道を通る（src/sky/staging.ts）。
 *   星座を見つける → 星が順に灯る → 星座線が引かれる → 名前が現れる
 *   → 触れると登場人物が出て、物語が始まる
 * 違うのは「空をどこから持ってくるか」と「演出の起点をいつ置くか」だけ。
 */
import { useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { altitudeOf, azimuthOf, enuFromAltAz, type Vec3 } from '../src/astro/math';
import { makeProjection, viewingDirection } from '../src/astro/projection';
import { DEMO_MODE_AVAILABLE } from '../src/config/featureFlags';
import { asterismById, type Asterism } from '../src/data/constellations';
import { mythById, type MythScene } from '../src/data/myths';
import { color, gutter, hitSlop, space } from '../src/design/tokens';
import { SkyCamera } from '../src/sensors/SkyCamera';
import { NEUTRAL_OBSERVER, useObserver, useClock } from '../src/sensors/useObserver';
import { useOrientation } from '../src/sensors/useOrientation';
import { DEMO_ASTERISM_ID } from '../src/sky/demoSky';
import { aimedAsterism } from '../src/sky/selection';
import { SkyCanvas, type SkyCanvasHandles } from '../src/sky/SkyCanvas';
import { labelStartOffset, mythSheetOffset, type StagingClock } from '../src/sky/staging';
import { useSkyModel, type SkySource } from '../src/sky/useSkyModel';
import { useSettings } from '../src/state/settings';
import { AimBar } from '../src/ui/AimBar';
import { MythSheet } from '../src/ui/MythSheet';
import { PermissionGate } from '../src/ui/PermissionGate';
import { StatusNote, type Note } from '../src/ui/StatusNote';
import { Type } from '../src/ui/Type';

/** 照準の判定を回す間隔。指の動きより遅くてよいが、遅すぎると反応が鈍い。 */
const AIM_INTERVAL_MS = 120;

/**
 * いちど演出が始まった星座は、少し視野から外れても外さない。
 * 境目でちらつくと、演出が始まったり止まったりして落ち着かない。
 */
const AIM_HYSTERESIS = 1.4;

/** デモ: 端末をこの高度より上へ向けると星座が現れる。 */
const DEMO_TRIGGER_ALTITUDE = 28;
/** デモ: この高度より下へ戻すと、次にまた見せられるよう解除する。 */
const DEMO_RELEASE_ALTITUDE = 12;
/**
 * デモ: 画面のちょうど中央ではなく、少しずらして置く。
 * 真ん中に貼りつくと「用意されていた」感じになる。わずかに探させる。
 */
const DEMO_OFFSET_ALTITUDE = 5;
const DEMO_OFFSET_AZIMUTH = -6;
/** デモ: 置き場所が決まるまでの仮の方向。この間は何も描かない。 */
const DEMO_PENDING_ANCHOR: Vec3 = enuFromAltAz(45, 180);

const EMPTY_HIGHLIGHT: ReadonlySet<number> = new Set<number>();

const IDLE_CLOCK: StagingClock = {
  skyFadeStartedAt: null,
  revealStartedAt: null,
  entranceStartedAt: null,
};

export default function SkyScreen() {
  useKeepAwake();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { settings } = useSettings();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const observerState = useObserver();
  const now = useClock();

  const demoEnabled = DEMO_MODE_AVAILABLE && settings.demoMode;

  // 画面が前面にあるあいだだけセンサーを回す。
  const [active, setActive] = useState(true);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  // 偏角と手動補正は分けて渡す。姿勢の取得元によって偏角が要るかどうかが違う。
  // デモでは実際の方角と合っている必要がないので、地磁気が未較正でも動かす。
  const correction = useMemo(
    () => ({
      declinationDeg: observerState.declination ?? 0,
      manualHeadingDeg: settings.headingOffsetDeg,
      manualPitchDeg: settings.pitchOffsetDeg,
    }),
    [observerState.declination, settings.headingOffsetDeg, settings.pitchOffsetDeg],
  );
  const { attitudeRef, status: orientation } = useOrientation({
    correction,
    enabled: active,
    headingFree: demoEnabled,
    requested: settings.attitudeSource,
  });

  /** デモで星座を置いた方向。null なら、まだ端末が上を向いていない。 */
  const [demoAnchor, setDemoAnchor] = useState<Vec3 | null>(null);

  const source = useMemo<SkySource>(
    () =>
      demoEnabled
        ? { kind: 'demo', anchor: demoAnchor ?? DEMO_PENDING_ANCHOR }
        : {
            kind: 'live',
            // 現在地が無いあいだは計算の型を満たすだけの値。星は描かない。
            observer: observerState.observer ?? NEUTRAL_OBSERVER,
            time: now,
            environment: settings.environment,
            onlyVisibleStars: settings.onlyVisibleStars,
          },
    [
      demoEnabled,
      demoAnchor,
      observerState.observer,
      now,
      settings.environment,
      settings.onlyVisibleStars,
    ],
  );
  const model = useSkyModel(source);

  /**
   * 星を描いてよいか。
   * 現在地が分からないまま「それらしい空」を出すことはしない。特定の都市を
   * 既定値にすると、その土地の人には合って見え、ほかの土地の人には黙って
   * 間違った空が出るため。星空を見たいだけならデモ表示がある。
   */
  const skyReady = demoEnabled || observerState.observer != null;

  const [aimed, setAimed] = useState<Asterism | null>(null);
  const [staged, setStaged] = useState<Asterism | null>(null);
  const [labelReady, setLabelReady] = useState(false);
  const [openedMythFor, setOpenedMythFor] = useState<Asterism | null>(null);

  const handlesRef = useRef<SkyCanvasHandles>({
    aimedId: null,
    stagedId: null,
    clock: IDLE_CLOCK,
    opacity: 1,
    highlightHrs: EMPTY_HIGHLIGHT,
  });
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mythTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (labelTimer.current) clearTimeout(labelTimer.current);
      if (mythTimer.current) clearTimeout(mythTimer.current);
    },
    [],
  );

  /** 演出をはじめから始める。本番もデモもここを通る。 */
  const beginStaging = useCallback((asterism: Asterism, withSkyFade: boolean) => {
    const startedAt = Date.now();
    setStaged(asterism);
    setLabelReady(false);
    handlesRef.current.stagedId = asterism.id;
    handlesRef.current.clock = {
      skyFadeStartedAt: withSkyFade ? startedAt : null,
      revealStartedAt: startedAt,
      entranceStartedAt: null,
    };
    if (labelTimer.current) clearTimeout(labelTimer.current);
    // 名前は GL ではなく React で出すので、同じ時計を共有する。
    labelTimer.current = setTimeout(
      () => setLabelReady(true),
      labelStartOffset(asterism, withSkyFade),
    );
  }, []);

  const clearStaging = useCallback(() => {
    setStaged(null);
    setLabelReady(false);
    handlesRef.current.stagedId = null;
    handlesRef.current.clock = IDLE_CLOCK;
    if (labelTimer.current) clearTimeout(labelTimer.current);
  }, []);

  // 端末の向きを一定間隔で見て、照準とデモの起動を判定する。
  useEffect(() => {
    if (!orientation.ready || !skyReady) return;
    const timer = setInterval(() => {
      const attitude = attitudeRef.current;

      if (demoEnabled) {
        const altitude = altitudeOf(viewingDirection(attitude));
        setDemoAnchor((current) => {
          if (!current && altitude > DEMO_TRIGGER_ALTITUDE) {
            const direction = viewingDirection(attitude);
            return enuFromAltAz(
              Math.min(80, altitudeOf(direction) + DEMO_OFFSET_ALTITUDE),
              azimuthOf(direction) + DEMO_OFFSET_AZIMUTH,
            );
          }
          if (current && altitude < DEMO_RELEASE_ALTITUDE) return null;
          return current;
        });
      }

      if (openedMythFor) return;

      const tolerance =
        makeProjection({ width, height }, settings.verticalFovDeg).verticalFovDeg / 2;
      let result = aimedAsterism(model.snapshot, attitude, tolerance);
      if (!result && staged) {
        // すでに演出中の星座だけは、少し外れても外さない。
        result = aimedAsterism(model.snapshot, attitude, tolerance * AIM_HYSTERESIS, [staged]);
      }
      const next = result?.asterism ?? null;
      setAimed((previous) => (previous?.id === next?.id ? previous : next));
    }, AIM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [
    orientation.ready,
    skyReady,
    attitudeRef,
    demoEnabled,
    openedMythFor,
    model.snapshot,
    staged,
    width,
    height,
    settings.verticalFovDeg,
  ]);

  useEffect(() => {
    handlesRef.current.aimedId = aimed?.id ?? null;
  }, [aimed]);

  // デモ: 置き場所が決まったら、空の出現から演出を始める。
  useEffect(() => {
    if (!demoEnabled) return;
    if (demoAnchor) {
      beginStaging(asterismById(DEMO_ASTERISM_ID), true);
    } else {
      clearStaging();
    }
  }, [demoEnabled, demoAnchor, beginStaging, clearStaging]);

  // 本番: 向けている星座が変わったら、そこから演出を始める。
  useEffect(() => {
    if (demoEnabled || openedMythFor) return;
    if (!aimed) {
      clearStaging();
      return;
    }
    if (aimed.id !== handlesRef.current.stagedId) beginStaging(aimed, false);
  }, [demoEnabled, aimed, openedMythFor, beginStaging, clearStaging]);

  // デモを切ったら、置き場所も演出も畳む。
  useEffect(() => {
    if (!demoEnabled) setDemoAnchor(null);
  }, [demoEnabled]);

  const openMyth = useCallback((asterism: Asterism) => {
    // 登場人物が現れ、少し遅れて物語のシートが上がる。重ねて流す。
    handlesRef.current.stagedId = asterism.id;
    handlesRef.current.clock = {
      ...handlesRef.current.clock,
      entranceStartedAt: Date.now(),
    };
    if (mythTimer.current) clearTimeout(mythTimer.current);
    mythTimer.current = setTimeout(() => setOpenedMythFor(asterism), mythSheetOffset());
  }, []);

  const closeMyth = useCallback(() => {
    if (mythTimer.current) clearTimeout(mythTimer.current);
    setOpenedMythFor(null);
    handlesRef.current.clock = { ...handlesRef.current.clock, entranceStartedAt: null };
    handlesRef.current.highlightHrs = EMPTY_HIGHLIGHT;
  }, []);

  /**
   * 場面が変わったら、空の側の見え方を合わせる。
   * 別の星座を指す場面では、線の色がそちらへ移る。物語が空を横切っていく。
   */
  const handleSceneChange = useCallback(
    (scene: MythScene) => {
      const focus = scene.focus;
      if (!focus) {
        handlesRef.current.stagedId = openedMythFor?.id ?? null;
        handlesRef.current.highlightHrs = EMPTY_HIGHLIGHT;
        return;
      }
      if (focus.kind === 'asterism') {
        handlesRef.current.stagedId = focus.id;
        handlesRef.current.highlightHrs = EMPTY_HIGHLIGHT;
        return;
      }
      handlesRef.current.stagedId = openedMythFor?.id ?? null;
      handlesRef.current.highlightHrs = new Set(
        focus.kind === 'star' ? [focus.hr] : focus.hrs,
      );
    },
    [openedMythFor],
  );

  const note = useStatusNote(
    observerState,
    orientation,
    cameraPermission?.granted ?? false,
    demoEnabled,
    demoAnchor != null,
  );

  if (!cameraPermission?.granted) {
    return (
      <PermissionGate
        onRequest={requestCameraPermission}
        denied={cameraPermission?.status === 'denied' && !cameraPermission.canAskAgain}
      />
    );
  }

  return (
    <View style={styles.root}>
      <SkyCamera useArCamera={orientation.usesArCamera} />
      {skyReady ? (
        <SkyCanvas
          model={model}
          attitudeRef={attitudeRef}
          handlesRef={handlesRef}
          verticalFovDeg={settings.verticalFovDeg}
        />
      ) : null}

      <StatusNote note={note} />

      {!openedMythFor ? (
        <>
          <Pressable
            onPress={() => router.push('/tune')}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel="表示のずれを調整する"
            style={[styles.tune, { top: insets.top + space.sm }]}
          >
            <Type variant="caption" tone="tertiary" overCamera>
              調整
            </Type>
          </Pressable>
          <AimBar asterism={labelReady && aimed ? aimed : null} onOpen={openMyth} />
          {!aimed && orientation.ready ? <FirstHint demo={demoEnabled} /> : null}
        </>
      ) : (
        <MythSheet
          myth={mythById(openedMythFor.mythId)}
          snapshot={model.snapshot}
          onClose={closeMyth}
          onSceneChange={handleSceneChange}
        />
      )}
    </View>
  );
}

/**
 * 最初の数秒だけ出る手がかり。
 * 使い方の説明画面は作らない。かざせばわかる、が前提の体験なので、
 * 迷っている人にだけ一行を渡す。
 */
const FirstHint = ({ demo }: { demo: boolean }) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <View style={styles.hint} pointerEvents="none">
      <Type variant="caption" tone="tertiary" overCamera>
        {demo ? '端末を空へ向ける' : '空にかざして、星座をさがす'}
      </Type>
    </View>
  );
};

/** 出すべき注記をひとつだけ選ぶ。同時に 2 つ以上出さない。 */
const useStatusNote = (
  observerState: ReturnType<typeof useObserver>,
  orientation: ReturnType<typeof useOrientation>['status'],
  cameraGranted: boolean,
  demoEnabled: boolean,
  demoPlaced: boolean,
): Note | null =>
  useMemo(() => {
    if (!cameraGranted) return null;
    if (demoEnabled) {
      // デモ中は実際の夜空を映していない。そのことを隠さない。
      // 方位や位置の警告は、デモでは意味がないので出さない。
      if (!orientation.ready) {
        return { id: 'sensor', tone: 'info', text: 'センサーを読み込んでいます' };
      }
      return {
        id: 'demo',
        tone: 'info',
        text: demoPlaced ? 'デモ表示・実際の夜空ではありません' : 'デモ表示・端末を空へ向けてください',
      };
    }
    if (orientation.accuracy === 'uncalibrated') {
      return {
        id: 'compass',
        tone: 'warn',
        text: '方位が定まりません。端末を 8 の字に大きく振ってください',
      };
    }
    if (orientation.accuracy === 'disturbed') {
      return {
        id: 'magnetic',
        tone: 'warn',
        text: '周囲の磁気が乱れています。金属や電線から離れてください',
      };
    }
    if (!orientation.ready) {
      return { id: 'sensor', tone: 'info', text: 'センサーを読み込んでいます' };
    }
    if (observerState.observer == null) {
      return {
        id: 'location',
        tone: 'warn',
        text:
          observerState.status === 'pending'
            ? '現在地を取得しています'
            : '現在地がわからないため、星の位置を計算できません',
        action:
          observerState.status === 'pending'
            ? undefined
            : { label: '許可する', onPress: () => void observerState.requestPermission() },
      };
    }
    return null;
  }, [cameraGranted, demoEnabled, demoPlaced, orientation.accuracy, orientation.ready, observerState]);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink.void },
  tune: {
    position: 'absolute',
    right: gutter,
    minHeight: 44,
    justifyContent: 'center',
  },
  hint: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    bottom: space.x4l,
    alignItems: 'center',
  },
});
