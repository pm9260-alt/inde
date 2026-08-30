/**
 * 姿勢の取得口。
 *
 * 精度の段階を上げていけるよう、実装を差し替えられる形にしてある。
 *
 *   fusion … expo-sensors の重力と地磁気から自前で組み立てる。
 *            Expo Go でそのまま動くので、Apple Developer Program に
 *            入らなくても実機で試せる。
 *   native … CMDeviceMotion のクォータニオンを .xTrueNorthZVertical 基準で
 *            そのまま受け取る（modules/sky-attitude）。Apple 自身の
 *            センサー融合を使うので fusion より安定する。dev build が必要。
 *   arkit  … ARSession(worldAlignment: .gravityAndHeading) による姿勢。
 *            カメラ映像の特徴点追跡を併用するため、いったん向きが定まれば
 *            その後は地磁気にほとんど依存せず、磁気の乱れに強い。
 *            ただし最初の方位はコンパスから取るので、絶対方位の偏りは残る。
 *            カメラを占有するので、映像も ARKit 側から出す。dev build が必要。
 *
 * どの実装も「DEV → 真北基準 ENU の回転」を返すことだけを約束する。
 * 磁気偏角の補正と手動の方位補正は、実装ごとではなくここで一括して足す。
 */
import type { Quat } from '../astro/math';
import type { AttitudeCorrection } from './corrections';

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
  /** DEV → 真北基準 ENU の回転。補正を適用済み。 */
  readonly attitude: Quat;
  readonly accuracy: OrientationAccuracy;
  /** 磁力（マイクロテスラ）。診断表示に使う。 */
  readonly fieldMagnitude: number;
  /** ARKit の追跡状態。ほかの経路では undefined。 */
  readonly trackingState?: string;
  /**
   * 重力による検算のずれ（度）。ARKit 経路のみ。
   * 座標系の読み替えが正しければ 0 に近い。大きければ軸の取り違え。
   */
  readonly gravityErrorDeg?: number;
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
   * 補正を渡す。姿勢を出力する直前に適用される。
   *
   * 磁気偏角を足すべきかどうかは実装によって違う。自前の TRIAD は磁北基準
   * なので必ず要るが、CoreMotion の .xTrueNorthZVertical と ARKit の
   * .gravityAndHeading はすでに真北基準なので足してはいけない。判断を
   * 呼び出し側に持たせないよう、値をそのまま渡して実装に委ねる。
   */
  setCorrection(correction: AttitudeCorrection): void;
  /**
   * 方位が実際の方角と合っている必要がない状態か（デモ）。
   *
   * true のあいだは、地磁気が未較正でも傾きだけで姿勢を作り始める。
   * 屋内では地磁気が乱れて較正できないことが多く、それでもデモは
   * 成立しなければならないため。本番では false のままにすること。
   */
  setHeadingFree(enabled: boolean): void;
}
