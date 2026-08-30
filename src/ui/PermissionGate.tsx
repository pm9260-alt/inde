/**
 * カメラの許可を求める画面。
 *
 * 「許可してください」とだけ書かない。なぜカメラが要るのかは、このアプリでは
 * 説明が要らないほど本質的なので、そのまま言葉にする。
 */
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gutter, radius, space } from '../design/tokens';
import { Type } from './Type';

interface Props {
  readonly onRequest: () => void;
  /** 一度断られ、アプリからは再度たずねられない状態。 */
  readonly denied: boolean;
}

export const PermissionGate = ({ onRequest, denied }: Props) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Type variant="display">夜空にかざす</Type>
        <Type variant="prose" tone="secondary" style={styles.body}>
          いま見えている空に星を重ねるために、カメラを使います。撮影した映像は
          端末の外へ送られず、保存もされません。
        </Type>
      </View>

      <Pressable
        onPress={denied ? () => void Linking.openSettings() : onRequest}
        style={styles.button}
        accessibilityRole="button"
      >
        <Type variant="body" tone="onEmber">
          {denied ? '設定でカメラを許可する' : 'カメラを使う'}
        </Type>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink.void,
    paddingHorizontal: gutter,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  body: {
    marginTop: space.xl,
  },
  button: {
    backgroundColor: color.ember.core,
    borderRadius: radius.sm,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xxl,
  },
});
