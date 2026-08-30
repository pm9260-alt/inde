/**
 * スカイビュー。このアプリの本体。
 *
 * 画面の構成は「カメラ映像 → 星空 → 必要なときだけ現れる文字」の 3 層。
 * 既定の状態では、文字は 1 つも出ていない。
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeProjection } from '../src/astro/projection';
import type { Asterism } from '../src/data/constellations';
import { mythById, type MythScene } from '../src/data/myths';
import { color, gutter, hitSlop, space } from '../src/design/tokens';
import { useObserver, useClock } from '../src/sensors/useObserver';
import { useOrientation } from '../src/sensors/useOrientation';
import { aimedAsterism } from '../src/sky/selection';
import { SkyCanvas, type SkyCanvasHandles } from '../src/sky/SkyCanvas';
import { useSkyModel } from '../src/sky/useSkyModel';
import { AimBar } from '../src/ui/AimBar';
import { MythSheet } from '../src/ui/MythSheet';
import { PermissionGate } from '../src/ui/PermissionGate';
import { StatusNote, type Note } from '../src/ui/StatusNote';
import { Type } from '../src/ui/Type';
import { useSettings } from '../src/state/settings';

/** 照準の判定を回す間隔。指の動きより遅くてよいが、遅すぎると反応が鈍い。 */
const AIM_INTERVAL_MS = 120;

const EMPTY_HIGHLIGHT: ReadonlySet<number> = new Set<number>();

export default function SkyScreen() {
  useKeepAwake();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { settings } = useSettings();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const observerState = useObserver();
  const now = useClock();

  // 画面が前面にあるあいだだけセンサーを回す。
  const [active, setActive] = useState(true);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  // 偏角と手動補正は分けて渡す。姿勢の取得元によって偏角が要るかどうかが違う。
  const { attitudeRef, status: orientation } = useOrientation(
    observerState.declination ?? 0,
    settings.headingOffsetDeg,
    active,
  );

  const model = useSkyModel(
    observerState.observer,
    now,
    settings.environment,
    settings.onlyVisibleStars,
  );

  const [aimed, setAimed] = useState<Asterism | null>(null);
  const [openedMythFor, setOpenedMythFor] = useState<Asterism | null>(null);

  const handlesRef = useRef<SkyCanvasHandles>({
    aimedId: null,
    selectedId: null,
    opacity: 1,
    highlightHrs: EMPTY_HIGHLIGHT,
  });

  // 画角の半分を照準の許容角にする。画面に入っている星座だけが候補になる。
  const aimTolerance = useMemo(
    () => makeProjection({ width, height }, settings.verticalFovDeg).verticalFovDeg / 2,
    [width, height, settings.verticalFovDeg],
  );

  // 姿勢は毎秒 60 回変わるが、どの星座を向いているかは頻繁には変わらない。
  // 一定間隔で確かめ、変わったときだけ React に伝える。
  useEffect(() => {
    if (openedMythFor || !orientation.ready) return;
    const timer = setInterval(() => {
      const result = aimedAsterism(model.snapshot, attitudeRef.current, aimTolerance);
      setAimed((previous) =>
        previous?.id === result?.asterism.id ? previous : (result?.asterism ?? null),
      );
    }, AIM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [model.snapshot, attitudeRef, aimTolerance, openedMythFor, orientation.ready]);

  useEffect(() => {
    handlesRef.current.aimedId = aimed?.id ?? null;
  }, [aimed]);

  const openMyth = useCallback((asterism: Asterism) => {
    setOpenedMythFor(asterism);
    handlesRef.current.selectedId = asterism.id;
  }, []);

  const closeMyth = useCallback(() => {
    setOpenedMythFor(null);
    handlesRef.current.selectedId = null;
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
        handlesRef.current.selectedId = openedMythFor?.id ?? null;
        handlesRef.current.highlightHrs = EMPTY_HIGHLIGHT;
        return;
      }
      if (focus.kind === 'asterism') {
        handlesRef.current.selectedId = focus.id;
        handlesRef.current.highlightHrs = EMPTY_HIGHLIGHT;
        return;
      }
      handlesRef.current.selectedId = openedMythFor?.id ?? null;
      handlesRef.current.highlightHrs = new Set(
        focus.kind === 'star' ? [focus.hr] : focus.hrs,
      );
    },
    [openedMythFor],
  );

  const note = useStatusNote(observerState, orientation, cameraPermission?.granted ?? false);

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
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <SkyCanvas
        model={model}
        attitudeRef={attitudeRef}
        handlesRef={handlesRef}
        verticalFovDeg={settings.verticalFovDeg}
      />

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
          <AimBar asterism={aimed} onOpen={openMyth} />
          {!aimed && orientation.ready ? <FirstHint /> : null}
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
const FirstHint = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <View style={styles.hint} pointerEvents="none">
      <Type variant="caption" tone="tertiary" overCamera>
        空にかざして、星座をさがす
      </Type>
    </View>
  );
};

/** 出すべき注記をひとつだけ選ぶ。同時に 2 つ以上出さない。 */
const useStatusNote = (
  observerState: ReturnType<typeof useObserver>,
  orientation: ReturnType<typeof useOrientation>['status'],
  cameraGranted: boolean,
): Note | null =>
  useMemo(() => {
    if (!cameraGranted) return null;
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
    if (observerState.status === 'fallback') {
      return {
        id: 'location',
        tone: 'info',
        text: '位置情報が無いため東京の空を表示しています',
        action: { label: '許可する', onPress: () => void observerState.requestPermission() },
      };
    }
    return null;
  }, [cameraGranted, orientation.accuracy, orientation.ready, observerState]);

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
