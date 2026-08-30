/**
 * 画面上部の注記。
 *
 * 出るのは、利用者が何かをしないと表示がずれ続けるときだけ。
 * 正常に動いているあいだは何も出さない。夜空を隠さないことを最優先にする。
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, duration, gutter, hitSlop, space } from '../design/tokens';
import { Type } from './Type';

export type NoteTone = 'info' | 'warn';

export interface Note {
  readonly id: string;
  readonly text: string;
  readonly tone: NoteTone;
  /** 押したときの操作。無ければ押せない。 */
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export const StatusNote = ({ note }: { note: Note | null }) => {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const shown = useRef<Note | null>(null);
  if (note) shown.current = note;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: note ? 1 : 0,
      duration: duration.quick,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [note, fade]);

  const current = shown.current;
  if (!current) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity: fade, paddingTop: insets.top + space.sm }]}
      pointerEvents={note?.action ? 'auto' : 'none'}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.marker,
            { backgroundColor: current.tone === 'warn' ? color.state.warn : color.ember.soft },
          ]}
        />
        <Type
          variant="caption"
          tone={current.tone === 'warn' ? 'warn' : 'secondary'}
          overCamera
          style={styles.text}
        >
          {current.text}
        </Type>
        {current.action ? (
          <Pressable onPress={current.action.onPress} hitSlop={hitSlop} accessibilityRole="button">
            <Type variant="caption" tone="ember" overCamera>
              {current.action.label}
            </Type>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: gutter,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  /** 種類を示す小さな点。アイコンを増やさずに区別をつける。 */
  marker: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  text: {
    flex: 1,
  },
});
