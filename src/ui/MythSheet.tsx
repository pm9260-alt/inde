/**
 * 神話の語り。
 *
 * 全画面を覆わない。画面の上 4 割には夜空を残したまま、下から静かに現れる。
 * 読んでいるあいだも、いま語られている星が空のどこにあるのかが見えている
 * ことが、このアプリの神話体験の前提になる。
 *
 * 長文を一度に出さず、場面をひとつずつ送る。場面が変わるたびに、空の側で
 * 光る星が変わり、ときには別の星座へ視線が移る。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { altitudeOf, azimuthOf, type Vec3 } from '../astro/math';
import { directionAt, starIndexByHr, type SkySnapshot } from '../astro/sky';
import { asterismById } from '../data/constellations';
import type { Myth, MythFocus, MythScene } from '../data/myths';
import { color, duration, gutter, hitSlop, radius, space, stroke } from '../design/tokens';
import { asterismCenter } from '../sky/selection';
import { skyPositionPhrase } from './format';
import { Type } from './Type';

/** シートが画面の下から占める割合。上に残る空が体験の一部なので取りすぎない。 */
const SHEET_HEIGHT_RATIO = 0.6;

interface Props {
  readonly myth: Myth;
  readonly snapshot: SkySnapshot;
  readonly onClose: () => void;
  /** 場面が変わるたびに呼ばれる。空の側の強調を切り替える。 */
  readonly onSceneChange: (scene: MythScene) => void;
}

export const MythSheet = ({ myth, snapshot, onClose, onSceneChange }: Props) => {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const scene = myth.scenes[index];
  const isLast = index === myth.scenes.length - 1;

  const slide = useRef(new Animated.Value(0)).current;
  const sceneFade = useRef(new Animated.Value(1)).current;
  /** 場面の切り替え待ち。画面を離れるときに取り消す。 */
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: duration.sheet,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  useEffect(() => {
    onSceneChange(scene);
  }, [scene, onSceneChange]);

  const advance = useCallback(
    (next: number) => {
      // 文字が入れ替わる瞬間だけ落とす。読み手の目が次の行を探さずに済む。
      Animated.sequence([
        Animated.timing(sceneFade, {
          toValue: 0,
          duration: duration.instant,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sceneFade, {
          toValue: 1,
          duration: duration.quick,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => setIndex(next), duration.instant);
    },
    [sceneFade],
  );

  const close = useCallback(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: duration.quick,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [slide, onClose]);

  const sheetHeight = height * SHEET_HEIGHT_RATIO;
  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  /** いま語られている対象が空のどこにあるか。画面外なら一言添える。 */
  const focusHint = useMemo(
    () => (scene.focus ? describeFocus(scene.focus, snapshot) : null),
    [scene.focus, snapshot],
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetHeight,
          paddingBottom: insets.bottom + space.lg,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Type variant="label" tone="ember">
            {myth.traditionLabel}
          </Type>
          <Type variant="title" style={styles.title}>
            {myth.title}
          </Type>
        </View>
        <Pressable onPress={close} hitSlop={hitSlop} accessibilityRole="button">
          <Type variant="caption" tone="tertiary">
            閉じる
          </Type>
        </Pressable>
      </View>

      <View style={styles.rule} />

      <Animated.View style={[styles.body, { opacity: sceneFade }]}>
        {index === 0 ? (
          <Type variant="verse" tone="secondary" style={styles.epigraph}>
            {myth.epigraph}
          </Type>
        ) : null}
        {scene.heading ? (
          <Type variant="label" tone="tertiary" style={styles.heading}>
            {scene.heading}
          </Type>
        ) : null}
        <Type variant="prose">{scene.body}</Type>
        {focusHint ? (
          <Type variant="caption" tone="tertiary" style={styles.hint}>
            {focusHint}
          </Type>
        ) : null}
      </Animated.View>

      <View style={styles.footer}>
        <SceneProgress total={myth.scenes.length} current={index} />
        <View style={styles.actions}>
          {index > 0 ? (
            <Pressable
              onPress={() => advance(index - 1)}
              hitSlop={hitSlop}
              accessibilityRole="button"
              style={styles.action}
            >
              <Type variant="body" tone="tertiary">
                もどる
              </Type>
            </Pressable>
          ) : null}
          <Pressable
            onPress={isLast ? close : () => advance(index + 1)}
            hitSlop={hitSlop}
            accessibilityRole="button"
            style={styles.action}
          >
            <Type variant="body" tone="ember">
              {isLast ? '空へもどる' : 'つづき'}
            </Type>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

/**
 * どこまで読んだか。数字ではなく、場面の数だけ並ぶ短い線で示す。
 * 「あと何ページ」を意識させず、それでも終わりがあることは伝わる。
 */
const SceneProgress = ({ total, current }: { total: number; current: number }) => (
  <View style={styles.progress} accessibilityLabel={`${total} 場面のうち ${current + 1} 場面目`}>
    {Array.from({ length: total }, (_, i) => (
      <View
        key={i}
        style={[
          styles.tick,
          i === current && styles.tickCurrent,
          i < current && styles.tickPast,
        ]}
      />
    ))}
  </View>
);

/** 語られている対象が空のどこにあるかを一言で。 */
const describeFocus = (focus: MythFocus, snapshot: SkySnapshot): string | null => {
  let direction: Vec3;
  let subject: string;

  if (focus.kind === 'asterism') {
    const asterism = asterismById(focus.id);
    direction = asterismCenter(snapshot, asterism);
    subject = asterism.nameJa;
  } else {
    const hrs = focus.kind === 'star' ? [focus.hr] : focus.hrs;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const hr of hrs) {
      const d = directionAt(snapshot, starIndexByHr(hr));
      x += d.x;
      y += d.y;
      z += d.z;
    }
    const magnitude = Math.hypot(x, y, z);
    if (magnitude < 1e-6) return null;
    direction = { x: x / magnitude, y: y / magnitude, z: z / magnitude };
    subject = hrs.length > 1 ? 'この星たち' : 'この星';
  }

  const altitude = altitudeOf(direction);
  const phrase = skyPositionPhrase(altitude, azimuthOf(direction));
  return altitude < 0
    ? `${subject}は、いま${phrase}にある`
    : `${subject}は${phrase}`;
};

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.scrim.strong,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: stroke.hairline,
    borderTopColor: color.ember.deep,
    paddingHorizontal: gutter,
    paddingTop: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  title: {
    marginTop: space.xxs,
  },
  rule: {
    height: stroke.hairline,
    backgroundColor: color.ink.line,
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  body: {
    flex: 1,
  },
  epigraph: {
    marginBottom: space.xl,
  },
  heading: {
    marginBottom: space.sm,
  },
  hint: {
    marginTop: space.xl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.lg,
  },
  progress: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'center',
  },
  tick: {
    width: 10,
    height: stroke.hairline,
    backgroundColor: color.ink.lineStrong,
  },
  tickPast: {
    backgroundColor: color.ember.deep,
  },
  tickCurrent: {
    width: 18,
    height: 2,
    backgroundColor: color.ember.core,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxl,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
