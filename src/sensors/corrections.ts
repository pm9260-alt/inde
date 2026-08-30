/**
 * 姿勢に後から足す補正。
 *
 * 補正には性質の違う 2 種類がある。混ぜないこと。
 *
 *   方位（heading） … 世界の側の量。磁気偏角も、コンパスの偏りも、
 *                      天頂軸まわりの回転として現れる。
 *   仰角（pitch）   … 端末の側の量。カメラの光軸が筐体に対してわずかに
 *                      傾いて実装されている、といった個体差はここに出る。
 *
 * 片方を他方で埋め合わせると、端末を傾けたときに合わなくなる。
 * 世界の側の回転は左から、端末の側の回転は右から掛かるので、
 * 適用の順序は結果に影響しない。
 *
 * 補正は最後の手段。まず座標変換・画角・姿勢推定の原因を特定すること。
 * docs/ACCURACY.md の切り分け手順を参照。
 */
import { applyHeadingOffset, applyPitchOffset, type Quat } from '../astro/math';

export interface AttitudeCorrection {
  /** 磁北から真北へのずれ（度・東が正）。真北基準の経路では 0。 */
  readonly declinationDeg: number;
  /** 利用者が手で加える方位の補正（度・東が正）。 */
  readonly manualHeadingDeg: number;
  /** 利用者が手で加える仰角の補正（度・正で狙いが上へ）。 */
  readonly manualPitchDeg: number;
}

export const NO_CORRECTION: AttitudeCorrection = {
  declinationDeg: 0,
  manualHeadingDeg: 0,
  manualPitchDeg: 0,
};

/** 補正を適用した姿勢を返す。 */
export const applyCorrection = (attitude: Quat, correction: AttitudeCorrection): Quat =>
  applyPitchOffset(
    applyHeadingOffset(attitude, correction.declinationDeg + correction.manualHeadingDeg),
    correction.manualPitchDeg,
  );
