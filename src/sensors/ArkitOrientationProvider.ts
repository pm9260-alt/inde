/**
 * ARKit の姿勢を使う実装。
 *
 * ARSession(worldAlignment: .gravityAndHeading) が返すカメラ姿勢を、
 * src/sensors/arkitFrame.ts で本アプリの座標系に読み替える。軸の対応は
 * Apple のドキュメントの記述から決めており、その正しさは Windows 上の
 * 単体テストで固定してある。
 *
 * 何が良くなるか
 * ---------------------------------------------------------------------------
 * ARKit はカメラ映像の特徴点追跡を併用するので、いったん向きが定まれば
 * その後は地磁気にほとんど依存しない。鉄骨や電線のそばでも姿勢が揺れず、
 * 時間が経ってもドリフトしにくい。
 *
 * 何が良くならないか
 * ---------------------------------------------------------------------------
 * 最初の方位は結局コンパスから取る。つまり**絶対方位の偏りは残る**。
 * ARKit にすれば北が正確になる、ということではない。残るのはほぼ一定の
 * ずれなので、そこは手動補正で打ち消すのが筋になる。
 *
 * カメラの占有
 * ---------------------------------------------------------------------------
 * ARSession はカメラを占有する。expo-camera のプレビューとは同時に動かない。
 * この経路を使うあいだは、映像もネイティブ側のビュー（SkyARView）から出す。
 */
import { DeviceMotion } from 'expo-sensors';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { quatNormalize, type Vec3 } from '../astro/math';
import {
  ARKIT_GRAVITY_TOLERANCE_DEG,
  arkitGravityError,
  enuAttitudeFromArkitCamera,
} from './arkitFrame';
import { gravityFromDeviceMotion } from './attitude';
import { applyCorrection, NO_CORRECTION, type AttitudeCorrection } from './corrections';
import type {
  OrientationAccuracy,
  OrientationListener,
  OrientationProvider,
} from './orientationProvider';

interface ArkitAttitudeEvent {
  /** カメラ → ワールド の回転。ワールドは x = 東, y = 天頂, z = 南。 */
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly trackingState: string;
  readonly headingAligned: boolean;
}

interface SkyAttitudeArkitModule {
  isArkitSupported(): boolean;
  startArkit(): void;
  stopArkit(): void;
  addListener(
    event: 'onArkitAttitude',
    listener: (payload: ArkitAttitudeEvent) => void,
  ): { remove(): void };
  addListener(
    event: 'onArkitFailure',
    listener: (payload: { message: string }) => void,
  ): { remove(): void };
}

const nativeModule = requireOptionalNativeModule<SkyAttitudeArkitModule>('SkyAttitude');

/** このビルドで ARKit 経路が使えるか。 */
export const isArkitAvailable = (): boolean => {
  try {
    return nativeModule?.isArkitSupported() ?? false;
  } catch {
    return false;
  }
};

/** 重力の検算に使う DeviceMotion の取得間隔。毎フレームは要らない。 */
const GRAVITY_CHECK_INTERVAL_MS = 100;

export class ArkitOrientationProvider implements OrientationProvider {
  readonly id = 'arkit' as const;

  private correction: AttitudeCorrection = NO_CORRECTION;
  private gravity: Vec3 | null = null;
  /** 直近に検算した、真下からのずれ（度）。 */
  private gravityErrorDeg: number | null = null;
  private lastFailure: string | null = null;

  async isAvailable(): Promise<boolean> {
    return isArkitAvailable();
  }

  /** ARKit は真北基準で整列しているので、磁気偏角は足さない。 */
  setCorrection(correction: AttitudeCorrection): void {
    this.correction = correction;
  }

  /** ARKit は地磁気に依存しないので、方位を問わない状態でも何も変えない。 */
  setHeadingFree(): void {}

  /** 直近の検算結果。診断画面が読む。 */
  get diagnostics(): { gravityErrorDeg: number | null; failure: string | null } {
    return { gravityErrorDeg: this.gravityErrorDeg, failure: this.lastFailure };
  }

  async start(listener: OrientationListener): Promise<() => void> {
    const module = nativeModule;
    if (!module) throw new Error('SkyAttitude モジュールがこのビルドに含まれていません');

    this.gravity = null;
    this.gravityErrorDeg = null;
    this.lastFailure = null;

    // 座標系の読み替えが正しいかを、ARKit とは別経路の重力で確かめ続ける。
    // 軸を取り違えていれば、ここに大きな角度差として現れる。
    DeviceMotion.setUpdateInterval(GRAVITY_CHECK_INTERVAL_MS);
    const motionSubscription = DeviceMotion.addListener((event) => {
      this.gravity = gravityFromDeviceMotion(
        event.acceleration,
        event.accelerationIncludingGravity,
      );
    });

    const failureSubscription = module.addListener('onArkitFailure', ({ message }) => {
      this.lastFailure = message;
    });

    const attitudeSubscription = module.addListener('onArkitAttitude', (event) => {
      const attitude = enuAttitudeFromArkitCamera(
        quatNormalize({ w: event.w, x: event.x, y: event.y, z: event.z }),
      );

      if (this.gravity) {
        this.gravityErrorDeg = arkitGravityError(attitude, this.gravity);
      }

      // ARKit は真北に整列しているので偏角は足さない。整列できていない
      // 場合（位置情報が無い等）は、方位が信用できないことを accuracy で示す。
      const correction: AttitudeCorrection = { ...this.correction, declinationDeg: 0 };

      listener({
        attitude: applyCorrection(attitude, correction),
        accuracy: this.accuracyOf(event),
        fieldMagnitude: 0,
        trackingState: event.trackingState,
        gravityErrorDeg: this.gravityErrorDeg ?? undefined,
      });
    });

    module.startArkit();

    return () => {
      attitudeSubscription.remove();
      failureSubscription.remove();
      motionSubscription.remove();
      module.stopArkit();
    };
  }

  private accuracyOf(event: ArkitAttitudeEvent): OrientationAccuracy {
    if (!event.headingAligned) return 'uncalibrated';
    if (event.trackingState === 'unavailable') return 'unavailable';
    if (event.trackingState !== 'normal') return 'disturbed';
    // 座標系の読み替えが疑わしいときは、正常とは言わない。
    if (
      this.gravityErrorDeg != null &&
      this.gravityErrorDeg > ARKIT_GRAVITY_TOLERANCE_DEG
    ) {
      return 'disturbed';
    }
    return 'ok';
  }
}
