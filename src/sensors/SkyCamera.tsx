/**
 * 星空の下に敷くカメラ映像。
 *
 * ARKit を使うあいだ、カメラは ARSession が占有する。expo-camera の
 * プレビューとは同時に動かないので、姿勢の経路に合わせて映像の出どころを
 * 切り替える。画面側はこの 1 つを置くだけでよい。
 */
import { CameraView } from 'expo-camera';
import { requireNativeViewManager } from 'expo-modules-core';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ComponentType } from 'react';

interface NativeViewProps {
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * ネイティブの AR ビュー。モジュールが入っていないビルド（Expo Go など）
 * では取得できないので、その場合は null にして expo-camera を使う。
 */
const ArNativeView: ComponentType<NativeViewProps> | null = (() => {
  try {
    return requireNativeViewManager<NativeViewProps>('SkyAttitude');
  } catch {
    return null;
  }
})();

export const isArCameraAvailable = (): boolean => ArNativeView != null;

interface Props {
  /** true なら ARKit 側の映像を出す。 */
  readonly useArCamera: boolean;
}

export const SkyCamera = ({ useArCamera }: Props) => {
  if (useArCamera && ArNativeView) {
    return <ArNativeView style={StyleSheet.absoluteFill} />;
  }
  if (useArCamera) {
    // ARKit を使う指定なのにビューが無い。姿勢側も同じ理由で使えないはずで、
    // その場合は下位の経路へ落ちている。映像だけ黒くしないよう通常のカメラを出す。
    return <CameraView style={StyleSheet.absoluteFill} facing="back" />;
  }
  return <CameraView style={StyleSheet.absoluteFill} facing="back" />;
};

/** カメラが出せないときの下敷き。 */
export const CameraFallback = ({ color }: { color: string }) => (
  <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
);
