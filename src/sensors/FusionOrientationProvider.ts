/**
 * expo-sensors だけで姿勢を作る実装。Expo Go で動く。
 *
 * DeviceMotion からは重力と角速度を、Magnetometer からは較正済みの磁場を
 * 受け取る。DeviceMotion のほうが速いので、そちらが来るたびに
 *   1. 角速度で姿勢を進める（予測）
 *   2. 重力と直近の磁場で観測へ寄せる（補正）
 * という順で更新する。速い動きはジャイロが、絶対的な向きは重力と磁場が
 * 受け持つ。
 */
import { DeviceMotion, Magnetometer } from 'expo-sensors';

import { applyHeadingOffset, vec, type Vec3 } from '../astro/math';
import {
  angularVelocityFromDeviceMotion,
  DEFAULT_FUSION_TUNING,
  gravityFromDeviceMotion,
  INITIAL_FUSION_STATE,
  propagateByAngularVelocity,
  updateFusion,
  type FusionState,
} from './attitude';
import type {
  OrientationAccuracy,
  OrientationListener,
  OrientationProvider,
} from './orientationProvider';

/** 重力と角速度の取得間隔（ミリ秒）。画面の更新に合わせて 60Hz。 */
const DEVICE_MOTION_INTERVAL_MS = 16;
/** 磁場の取得間隔。方位はゆっくり補正するので半分でよい。 */
const MAGNETOMETER_INTERVAL_MS = 33;
/** これ以上間隔が空いたサンプルは、角速度による予測を打ち切る。 */
const MAX_PROPAGATION_SECONDS = 0.2;

export class FusionOrientationProvider implements OrientationProvider {
  readonly id = 'fusion' as const;

  private state: FusionState = INITIAL_FUSION_STATE;
  private field: Vec3 | null = null;
  private lastTimestamp: number | null = null;
  private headingOffset = 0;
  private headingFree = false;

  async isAvailable(): Promise<boolean> {
    const [motion, magnetometer] = await Promise.all([
      DeviceMotion.isAvailableAsync(),
      Magnetometer.isAvailableAsync(),
    ]);
    return motion && magnetometer;
  }

  /** 自前の TRIAD は磁北基準なので、偏角も手動補正も両方足す。 */
  setHeadingCorrection(declinationDeg: number, manualDeg: number): void {
    this.headingOffset = declinationDeg + manualDeg;
  }

  setHeadingFree(enabled: boolean): void {
    this.headingFree = enabled;
  }

  /**
   * 方位を問わない状態では、地磁気による方位補正を止める。
   *
   * 止めないと、屋内で地磁気が遅れて使えるようになった瞬間に、方位が
   * 磁北へ引き寄せられて空全体が回ってしまう。デモは端末を向けた先に
   * 星座を置いているので、その基準が動くと置いたものがずれていく。
   * 傾きは重力から、方位はジャイロだけから取るのが正しい。
   */
  private get tuning() {
    return this.headingFree
      ? { ...DEFAULT_FUSION_TUNING, headingCorrection: 0 }
      : DEFAULT_FUSION_TUNING;
  }

  async start(listener: OrientationListener): Promise<() => void> {
    this.state = INITIAL_FUSION_STATE;
    this.field = null;
    this.lastTimestamp = null;

    DeviceMotion.setUpdateInterval(DEVICE_MOTION_INTERVAL_MS);
    Magnetometer.setUpdateInterval(MAGNETOMETER_INTERVAL_MS);

    const magnetometerSubscription = Magnetometer.addListener(({ x, y, z }) => {
      this.field = vec(x, y, z);
    });

    const motionSubscription = DeviceMotion.addListener((event) => {
      const gravity = gravityFromDeviceMotion(
        event.acceleration,
        event.accelerationIncludingGravity,
      );

      // 角速度で姿勢を進めてから観測で補正する。
      const timestamp = event.rotation?.timestamp ?? null;
      if (this.state.attitude && timestamp != null && this.lastTimestamp != null) {
        const dt = timestamp - this.lastTimestamp;
        if (dt > 0 && dt < MAX_PROPAGATION_SECONDS) {
          this.state = {
            ...this.state,
            attitude: propagateByAngularVelocity(
              this.state.attitude,
              angularVelocityFromDeviceMotion(event.rotationRate),
              dt,
            ),
          };
        }
      }
      this.lastTimestamp = timestamp;

      this.state = updateFusion(
        this.state,
        gravity,
        // 磁場がまだ来ていないあいだはゼロとして扱う。方位を問わない状態
        // （デモ）なら、それでも傾きだけで姿勢が立ち上がる。
        this.field ?? vec(0, 0, 0),
        this.tuning,
        { allowHeadingFreeStart: this.headingFree },
      );

      const attitude = this.state.attitude;
      if (!attitude) return;
      listener({
        attitude: applyHeadingOffset(attitude, this.headingOffset),
        accuracy: this.accuracyOf(),
        fieldMagnitude: this.state.fieldMagnitude,
      });
    });

    return () => {
      motionSubscription.remove();
      magnetometerSubscription.remove();
      DeviceMotion.removeAllListeners();
      Magnetometer.removeAllListeners();
    };
  }

  private accuracyOf(): OrientationAccuracy {
    if (!this.state.attitude) return 'unavailable';
    // CoreMotion は磁気センサーが未較正のあいだ、磁場としてゼロを返す。
    if (this.state.fieldMagnitude < 5) return 'uncalibrated';
    if (this.state.magneticDisturbed) return 'disturbed';
    return 'ok';
  }
}
