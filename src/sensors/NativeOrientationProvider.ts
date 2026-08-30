/**
 * ネイティブモジュール（modules/sky-attitude）から姿勢を受け取る実装。
 *
 * CMDeviceMotion のクォータニオンをそのまま使う。オイラー角の特異点が無く、
 * Apple 自身のセンサー融合の結果を利用できる。参照フレームに真北基準が
 * 使えていれば、磁気偏角の補正も要らない。
 *
 * このモジュールは Expo Go には含まれない。requireOptionalNativeModule で
 * 読むので、無ければ null が返るだけで、アプリは fusion 実装に切り替わる。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

import {
  applyHeadingOffset,
  DEG,
  quatFromAxisAngle,
  quatMultiply,
  quatNormalize,
  vec,
  type Quat,
} from '../astro/math';
import type {
  OrientationAccuracy,
  OrientationListener,
  OrientationProvider,
} from './orientationProvider';

/** ネイティブ側が送るイベント。modules/sky-attitude/ios と対応させること。 */
interface NativeAttitudeEvent {
  /** 端末 → 参照フレーム の回転。参照フレームは x = 北, y = 西, z = 天頂。 */
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** CMMagneticFieldCalibrationAccuracy の生値（-1 未較正 / 0 低 / 1 中 / 2 高）。 */
  readonly headingAccuracy: number;
  readonly fieldMagnitude: number;
  /** 参照フレームが真北基準か。false なら磁北基準。 */
  readonly trueNorth: boolean;
}

interface SkyAttitudeModule {
  isAvailable(): boolean;
  isTrueNorthReferenced(): boolean;
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

/**
 * CoreMotion の参照フレーム (x = 北, y = 西, z = 天頂) を
 * 本アプリの ENU (x = 東, y = 北, z = 天頂) に読み替える回転。
 *
 * (北, 西, 天頂) の成分 (a, b, c) は ENU では (−b, a, c) になる。
 * これは天頂軸まわりの +90° の回転にあたる。
 */
const REFERENCE_TO_ENU: Quat = quatFromAxisAngle(vec(0, 0, 1), 90 * DEG);

export class NativeOrientationProvider implements OrientationProvider {
  readonly id = 'native' as const;

  private declination = 0;
  private manual = 0;

  async isAvailable(): Promise<boolean> {
    return nativeModule?.isAvailable() ?? false;
  }

  setHeadingCorrection(declinationDeg: number, manualDeg: number): void {
    this.declination = declinationDeg;
    this.manual = manualDeg;
  }

  /**
   * CoreMotion は地磁気が未較正でも姿勢を返し続けるので、こちらでは何もしない。
   * 方位が実際とずれるだけで、姿勢そのものは得られる。
   */
  setHeadingFree(): void {}

  async start(listener: OrientationListener): Promise<() => void> {
    const module = nativeModule;
    if (!module) throw new Error('SkyAttitude モジュールがこのビルドに含まれていません');

    const subscription = module.addListener('onAttitude', (event) => {
      const deviceToReference = quatNormalize({
        w: event.w,
        x: event.x,
        y: event.y,
        z: event.z,
      });
      const deviceToEnu = quatNormalize(quatMultiply(REFERENCE_TO_ENU, deviceToReference));
      // 真北基準で取れているなら偏角を足してはいけない。
      const offset = (event.trueNorth ? 0 : this.declination) + this.manual;

      listener({
        attitude: applyHeadingOffset(deviceToEnu, offset),
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
