/**
 * ネイティブモジュール（modules/sky-attitude）から姿勢を受け取る実装。
 *
 * CMDeviceMotion のクォータニオンを .xTrueNorthZVertical 基準でそのまま
 * 取り出す。Apple 自身のセンサー融合をそのまま使えるので、自前の TRIAD より
 * ノイズと追従の両面で有利。また真北基準なので磁気偏角の補正も不要。
 *
 * このモジュールは Expo Go には入っていない。requireOptionalNativeModule で
 * 読むので、存在しなければ null が返るだけで、アプリは fusion に切り替わる。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

import { applyHeadingOffset, quatNormalize } from '../astro/math';
import type {
  OrientationAccuracy,
  OrientationListener,
  OrientationProvider,
} from './orientationProvider';

/** ネイティブ側が送ってくるイベントの形。modules/sky-attitude と対応させること。 */
interface NativeAttitudeEvent {
  /** DEV → 真北基準 ENU。CoreMotion の規約に合わせて変換済み。 */
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** CMMagneticFieldCalibrationAccuracy を 0（未較正）〜3（高）で表したもの。 */
  readonly headingAccuracy: number;
  readonly fieldMagnitude: number;
}

interface SkyAttitudeModule {
  isAvailable(): boolean;
  start(): void;
  stop(): void;
  addListener(
    event: 'onAttitude',
    listener: (payload: NativeAttitudeEvent) => void,
  ): { remove(): void };
}

const nativeModule = requireOptionalNativeModule<SkyAttitudeModule>('SkyAttitude');

/** このビルドにネイティブ姿勢モジュールが含まれているか。 */
export const isNativeAttitudeAvailable = (): boolean => nativeModule != null;

export class NativeOrientationProvider implements OrientationProvider {
  readonly id = 'native' as const;

  private headingOffset = 0;

  async isAvailable(): Promise<boolean> {
    return nativeModule?.isAvailable() ?? false;
  }

  setHeadingOffset(degrees: number): void {
    this.headingOffset = degrees;
  }

  async start(listener: OrientationListener): Promise<() => void> {
    const module = nativeModule;
    if (!module) throw new Error('SkyAttitude モジュールがこのビルドに含まれていません');

    const subscription = module.addListener('onAttitude', (event) => {
      listener({
        attitude: applyHeadingOffset(
          quatNormalize({ w: event.w, x: event.x, y: event.y, z: event.z }),
          this.headingOffset,
        ),
        accuracy: accuracyFromNative(event.headingAccuracy),
        fieldMagnitude: event.fieldMagnitude,
      });
    });
    module.start();

    return () => {
      subscription.remove();
      module.stop();
    };
  }
}

const accuracyFromNative = (value: number): OrientationAccuracy => {
  // CMMagneticFieldCalibrationAccuracy: -1 未較正 / 0 低 / 1 中 / 2 高
  if (value < 0) return 'uncalibrated';
  if (value === 0) return 'disturbed';
  return 'ok';
};
