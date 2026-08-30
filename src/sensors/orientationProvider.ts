/**
 * 姿勢の取得口。
 *
 * 精度の段階を上げていけるよう、実装を差し替えられる形にしてある。
 *
 *   fusion … expo-sensors の重力と地磁気から自前で組み立てる。
 *            Expo Go でそのまま動くので、Apple Developer Program に
 *            入らなくても実機で試せる。MVP の既定。
 *   native … CMDeviceMotion のクォータニオンを .xTrueNorthZVertical 基準で
 *            そのまま受け取る（modules/sky-attitude）。Apple 自身の
 *            センサー融合を使うので fusion より安定する。dev build が必要。
 *   arkit  … ARSession(worldAlignment: .gravityAndHeading) による姿勢。
 *            視覚情報を併用するため磁気外乱に強い。将来の拡張。
 *
 * どの実装も「DEV → 真北基準 ENU の回転」を返すことだけを約束する。
 * 磁気偏角の補正と手動の方位補正は、実装ごとではなくここで一括して足す。
 */
import type { Quat } from '../astro/math';

/** 方位の信頼度。UI の警告と、較正を促すかどうかの判断に使う。 */
export type OrientationAccuracy =
  /** センサーが使えない、または姿勢がまだ得られていない。 */
  | 'unavailable'
  /** 磁気センサーが未較正。端末を 8 の字に振ってもらう必要がある。 */
  | 'uncalibrated'
  /** 周囲の磁気が乱れている。金属や電線から離れてもらう。 */
  | 'disturbed'
  /** 通常。 */
  | 'ok';

export interface OrientationSample {
  /** DEV → 真北基準 ENU の回転。 */
  readonly attitude: Quat;
  readonly accuracy: OrientationAccuracy;
  /** 磁力（マイクロテスラ）。診断表示に使う。 */
  readonly fieldMagnitude: number;
}

export type OrientationListener = (sample: OrientationSample) => void;

export interface OrientationProvider {
  /** 実装の識別子。診断画面に出す。 */
  readonly id: 'fusion' | 'native' | 'arkit';
  /** この端末でこの実装が使えるか。 */
  isAvailable(): Promise<boolean>;
  /**
   * 購読を始める。戻り値を呼ぶと停止する。
   * listener はセンサーの更新頻度（毎秒 60 回程度）で呼ばれるので、
   * 受け手は React の状態更新をしないこと。
   */
  start(listener: OrientationListener): Promise<() => void>;
  /**
   * 磁北から真北への補正と、利用者による手動補正の合計（度・東が正）。
   * 姿勢を出力する直前に適用される。
   */
  setHeadingOffset(degrees: number): void;
}
