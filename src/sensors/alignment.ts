/**
 * 実際の星と、画面に描いた星のずれを測る。
 *
 * 使い方は 1 つだけ。**画面の中央を、実際に見えている明るい星に合わせる。**
 * そのとき、こちらが「その星はここにあるはず」と思っている向きと、
 * 実際に端末が向いている向きの差が、そのまま表示の誤差になる。
 *
 * 出す値は 2 通り。
 *   画面での見え方（右へ何度・上へ何度）… 人が見て報告しやすい形
 *   世界での向き（方位・高度）           … 補正に使える形
 * 端末を傾けていると両者は一致しないので、両方を出す。
 *
 * 補正について
 * ---------------------------------------------------------------------------
 * ここで得た値をそのまま補正に入れれば、その場では必ず合う。だからこそ
 * 危うい。座標変換の誤り、画角の設定違い、姿勢推定の不具合も、同じように
 * 「合って」しまう。補正を入れる前に docs/ACCURACY.md の切り分けを済ませ、
 * 複数の星・複数の向きで同じずれ量が出ることを確かめること。
 */
import {
  altitudeOf,
  azimuthOf,
  RAD,
  rotateInverse,
  type Quat,
  type Vec3,
} from '../astro/math';
import { viewingDirection } from '../astro/projection';
import type { AttitudeCorrection } from './corrections';

export interface AlignmentSample {
  /** 画面中央から見た予測位置のずれ。右が正（度）。 */
  readonly rightDeg: number;
  /** 同、上が正（度）。 */
  readonly upDeg: number;
  /** 方位のずれ。予測 − 実際（度・東が正）。 */
  readonly azimuthDeg: number;
  /** 高度のずれ。予測 − 実際（度・上が正）。 */
  readonly altitudeDeg: number;
  /** ずれの大きさ（度）。 */
  readonly totalDeg: number;
}

/** −180〜180 に畳む。 */
const wrapDegrees = (degrees: number): number => ((degrees + 540) % 360) - 180;

/**
 * @param attitude       いまの姿勢（補正適用後）
 * @param starDirection  こちらが思っている星の向き（ENU 単位ベクトル）
 */
export const measureAlignment = (attitude: Quat, starDirection: Vec3): AlignmentSample => {
  // 端末座標系での星の向き。背面カメラは −z を向いている。
  const d = rotateInverse(attitude, starDirection);
  const forward = -d.z;
  const rightDeg = Math.atan2(d.x, forward) * RAD;
  const upDeg = Math.atan2(d.y, Math.hypot(d.x, d.z)) * RAD;

  const view = viewingDirection(attitude);
  const azimuthDeg = wrapDegrees(azimuthOf(starDirection) - azimuthOf(view));
  const altitudeDeg = altitudeOf(starDirection) - altitudeOf(view);

  return {
    rightDeg,
    upDeg,
    azimuthDeg,
    altitudeDeg,
    totalDeg: Math.hypot(rightDeg, upDeg),
  };
};

/**
 * 測ったずれを打ち消す補正を返す。
 *
 * 方位は世界の側（天頂軸まわり）、仰角は端末の側（左右軸まわり）に足す。
 * 符号の根拠:
 *   方位補正を +d 増やすと、報告される方位が +d 大きくなり、
 *   空に固定された星は画面上で d だけ左へ動く。予測が実際より
 *   方位 +azimuthDeg のところにあるなら、同じだけ足せば重なる。
 *   仰角補正を +θ 増やすと狙いが θ 上がり、星は画面上で θ 下がる。
 */
export const suggestedCorrection = (
  current: AttitudeCorrection,
  sample: AlignmentSample,
): AttitudeCorrection => ({
  declinationDeg: current.declinationDeg,
  manualHeadingDeg: current.manualHeadingDeg + sample.azimuthDeg,
  manualPitchDeg: current.manualPitchDeg + sample.altitudeDeg,
});

/**
 * この大きさを超えるずれは、補正で埋めるべきではない。
 *
 * カメラ光軸の傾きや地磁気の偏りで説明できるのはせいぜい数度。
 * それ以上のずれが出ているなら、座標変換・画角・姿勢推定のどれかが
 * 疑わしい。補正で見えなくする前に原因を探すこと。
 */
export const CORRECTION_SANITY_LIMIT_DEG = 8;

export const isCorrectionSuspicious = (sample: AlignmentSample): boolean =>
  Math.abs(sample.azimuthDeg) > CORRECTION_SANITY_LIMIT_DEG ||
  Math.abs(sample.altitudeDeg) > CORRECTION_SANITY_LIMIT_DEG;
