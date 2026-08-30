/**
 * 端末を向けている星座の名前。
 *
 * 画面の下に、面で囲わずに置く。夜空の上に文字だけが浮かぶ。
 * 何も向けていないときは何も出ない。それがこの画面の既定の状態。
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import type { Asterism } from '../data/constellations';
import { color, duration, gutter, space, staging, stroke } from '../design/tokens';
import { Type } from './Type';

interface Props {
  readonly asterism: Asterism | null;
  readonly onOpen: (asterism: Asterism) => void;
}

export const AimBar = ({ asterism, onOpen }: Props) => {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(8)).current;
  // 名前が消えるあいだも文字を残しておくため、直前の星座を覚えておく。
  const shown = useRef<Asterism | null>(null);
  if (asterism) shown.current = asterism;

  useEffect(() => {
    const visible = asterism != null;
    Animated.parallel([
      // 現れるときは演出の時計に合わせてゆっくり。消えるときは速く。
      // 出るときの間は見せるためのもの、消えるときの間は邪魔でしかない。
      Animated.timing(fade, {
        toValue: visible ? 1 : 0,
        duration: visible ? staging.labelFade : duration.quick,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: visible ? 0 : 8,
        duration: visible ? staging.labelFade : duration.quick,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [asterism, fade, rise]);

  const current = shown.current;
  if (!current) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity: fade, transform: [{ translateY: rise }] }]}
      pointerEvents={asterism ? 'auto' : 'none'}
    >
      <Pressable
        onPress={() => asterism && onOpen(asterism)}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={`${current.nameJa}の物語をひらく`}
      >
        <View style={styles.rule} />
        <View style={styles.row}>
          <View style={styles.names}>
            <Type variant="title" overCamera>
              {current.nameJa}
            </Type>
            <Type variant="caption" tone="tertiary" overCamera style={styles.meta}>
              {current.reading}　{current.bestSeason}の空
            </Type>
          </View>
          <Type variant="body" tone="ember" overCamera>
            物語
          </Type>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  pressable: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  /** 名前の上に引く短い線。囲わずに領域を示すための唯一の装飾。 */
  rule: {
    width: 28,
    height: stroke.hairline,
    backgroundColor: color.ember.soft,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  names: {
    flex: 1,
  },
  meta: {
    marginTop: space.xxs,
  },
});
