/**
 * 文字。
 *
 * 画面側でフォント名やサイズを直接書かないための唯一の入口。
 * 見出しの大きさを変えたくなったら tokens.ts を直す。
 */
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { color, typography } from '../design/tokens';

export type TypeVariant = keyof typeof typography;
export type TypeTone = 'primary' | 'secondary' | 'tertiary' | 'ember' | 'onEmber' | 'warn';

const TONES: Record<TypeTone, string> = {
  primary: color.text.primary,
  secondary: color.text.secondary,
  tertiary: color.text.tertiary,
  ember: color.ember.core,
  onEmber: color.text.onEmber,
  warn: color.state.warn,
};

/**
 * カメラ映像の上に文字を置くときの影。
 * 夜空は暗いので普段は不要だが、街灯や月が画角に入ると背景が明るくなる。
 * 面で覆うより、文字自身にごく淡い影を持たせるほうが空を隠さない。
 */
const OVER_CAMERA_SHADOW: TextStyle = {
  textShadowColor: 'rgba(5, 7, 11, 0.85)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

interface Props extends TextProps {
  readonly variant?: TypeVariant;
  readonly tone?: TypeTone;
  /** カメラ映像の上に直接置く文字。読みやすさのための影がつく。 */
  readonly overCamera?: boolean;
  readonly style?: StyleProp<TextStyle>;
}

export const Type = ({
  variant = 'body',
  tone = 'primary',
  overCamera = false,
  style,
  ...rest
}: Props) => (
  <Text
    {...rest}
    style={[
      typography[variant],
      { color: TONES[tone] },
      overCamera && OVER_CAMERA_SHADOW,
      style,
    ]}
  />
);
