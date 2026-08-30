/**
 * 数値をひと押しずつ動かす操作。
 *
 * ここではスライダーを使わない。表示のずれを詰める作業では 0.5° 単位の
 * 再現性が要るし、「いくつ動かしたか」を言葉で伝えられることが大事なので、
 * 指の位置で決まる操作より、押した回数で決まる操作のほうが合っている。
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, minTouchTarget, radius, space, stroke } from '../design/tokens';
import { Type } from './Type';

interface Props {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  /** 表示用の文字列。単位や符号の付け方はここで決める。 */
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
  /** 補足。何を動かしているのか一言で。 */
  readonly hint?: string;
}

export const Stepper = ({ label, value, step, min, max, format, onChange, hint }: Props) => {
  const change = (delta: number) => {
    const next = Math.min(max, Math.max(min, Math.round((value + delta) / step) * step));
    // 浮動小数の誤差が溜まらないよう、刻みの桁で丸める。
    const digits = Math.max(0, -Math.floor(Math.log10(step)));
    onChange(Number(next.toFixed(digits)));
  };

  return (
    <View style={styles.root}>
      <View style={styles.labels}>
        <Type variant="body">{label}</Type>
        {hint ? (
          <Type variant="caption" tone="tertiary" style={styles.hint}>
            {hint}
          </Type>
        ) : null}
      </View>
      <View style={styles.control}>
        <Pressable
          onPress={() => change(-step)}
          disabled={value <= min}
          style={[styles.button, value <= min && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`${label}を減らす`}
        >
          <Type variant="body" tone={value <= min ? 'tertiary' : 'primary'}>
            −
          </Type>
        </Pressable>
        <Type variant="numeric" style={styles.value}>
          {format(value)}
        </Type>
        <Pressable
          onPress={() => change(step)}
          disabled={value >= max}
          style={[styles.button, value >= max && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`${label}を増やす`}
        >
          <Type variant="body" tone={value >= max ? 'tertiary' : 'primary'}>
            ＋
          </Type>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    gap: space.lg,
  },
  labels: {
    flex: 1,
  },
  hint: {
    marginTop: space.xxs,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: stroke.hairline,
    borderColor: color.ink.lineStrong,
    borderRadius: radius.sm,
  },
  buttonDisabled: {
    borderColor: color.ink.line,
  },
  value: {
    minWidth: 78,
    textAlign: 'center',
    color: color.text.primary,
  },
});
