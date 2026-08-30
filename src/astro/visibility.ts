/**
 * 「いま、ここで、肉眼に見える可能性が高いか」を見積もる。
 *
 * このアプリの差別化はここにある。星図アプリは空にある星をすべて描くが、
 * 都市の空で実際に目に入るのはそのごく一部で、画面と現実が食い違う。
 * 見える星だけを描けば、画面と空を見比べる作業そのものが成立する。
 *
 * 計算の流れ
 * ---------------------------------------------------------------------------
 *   1. 空の明るさ（mag/arcsec^2）を求める。
 *      光害 + 薄明 + 月明かり を、輝度の線形和として合成する。
 *   2. 空の明るさから肉眼極限等級を求める。
 *   3. 星の等級に大気減光を加えて、見かけの等級を求める。
 *   4. 2 と 3 を比べる。
 *
 * 各段階の出典
 * ---------------------------------------------------------------------------
 *   大気路程   Kasten, F. & Young, A. T. (1989), Applied Optics 28, 4735.
 *   極限等級   Schaefer, B. E. (1990), PASP 102, 212.
 *   月明かり   Krisciunas, K. & Schaefer, B. E. (1991), PASP 103, 1033.
 *   光害の基準 Bortle, J. E. (2001), Sky & Telescope, February 2001.
 *   薄明       下記 TWILIGHT_BRIGHTNESS に注記あり（一次近似）。
 */
import { Body, Equator, Horizon, Illumination, Observer as AstroObserver } from 'astronomy-engine';

import { DEG, RAD } from './math';
import type { ObserverLocation } from './sky';

/**
 * 空の状態のおおまかな区分。Bortle (2001) の階級に対応する天頂の
 * 空の明るさ（mag/arcsec^2）を代表値として持つ。数字が大きいほど暗い空。
 */
export type SkyEnvironment = 'city' | 'suburb' | 'rural' | 'dark';

export const SKY_ENVIRONMENTS: Record<
  SkyEnvironment,
  { readonly label: string; readonly detail: string; readonly zenithBrightness: number }
> = {
  city: {
    label: '市街地',
    detail: '駅前・繁華街。一等星がようやく',
    zenithBrightness: 18.0, // Bortle 8–9
  },
  suburb: {
    label: '住宅地',
    detail: '街灯のある郊外。三等星まで',
    zenithBrightness: 19.3, // Bortle 6–7
  },
  rural: {
    label: '郊外',
    detail: '町を離れた場所。四等星まで',
    zenithBrightness: 20.8, // Bortle 4–5
  },
  dark: {
    label: '暗い空',
    detail: '山間・離島。天の川が見える',
    zenithBrightness: 21.7, // Bortle 2–3
  },
};

/** V バンドの大気減光係数（等級/大気路程）。晴天の平地でおよそ 0.15〜0.30。 */
const EXTINCTION_COEFFICIENT = 0.22;

/**
 * 大気路程。Kasten & Young (1989) の式。
 * 天頂で 1.0、地平線で約 38。
 */
export const airmass = (altitudeDeg: number): number => {
  const zenithDeg = 90 - altitudeDeg;
  if (zenithDeg >= 96) return Number.POSITIVE_INFINITY;
  const denominator =
    Math.cos(zenithDeg * DEG) + 0.50572 * (96.07995 - zenithDeg) ** -1.6364;
  return denominator <= 0 ? Number.POSITIVE_INFINITY : 1 / denominator;
};

/** 大気減光を加えた見かけの等級。 */
export const extinctedMagnitude = (magnitude: number, altitudeDeg: number): number => {
  const x = airmass(altitudeDeg);
  if (!Number.isFinite(x)) return Number.POSITIVE_INFINITY;
  return magnitude + EXTINCTION_COEFFICIENT * x;
};

/**
 * 空の明るさから肉眼極限等級を求める。Schaefer (1990) の関係式。
 * B = 21.7 で 6.5 等、B = 18.0 で 4.0 等になる。
 */
export const limitingMagnitude = (skyBrightness: number): number =>
  7.93 - 5 * Math.log10(1 + 10 ** (4.316 - skyBrightness / 5));

/**
 * 薄明による天頂の空の明るさ（mag/arcsec^2）。太陽高度から引く。
 *
 * 注記: これは公表モデルではなく、薄明の定義と、そこで見えるとされる
 * 星の等級から Schaefer (1990) の関係式を逆に解いて置いた基準点を、
 * 対数輝度で線形補間したもの。市民薄明（−6°）でおよそ 1.5 等星まで、
 * 天文薄明の終わり（−18°）で寄与が無視できる、という挙動になる。
 * より厳密なモデルに置き換える余地がある箇所。
 */
const TWILIGHT_BRIGHTNESS: readonly (readonly [number, number])[] = [
  [0, 5.0],
  [-3, 11.0],
  [-6, 15.3],
  [-9, 17.6],
  [-12, 19.6],
  [-15, 21.0],
  [-18, 23.0],
];

const twilightBrightness = (sunAltitudeDeg: number): number => {
  // 天文薄明の終わり（−18°）より下では寄与しない。
  if (sunAltitudeDeg < -18) return Number.POSITIVE_INFINITY;
  if (sunAltitudeDeg >= 0) return TWILIGHT_BRIGHTNESS[0][1];
  for (let i = 0; i < TWILIGHT_BRIGHTNESS.length - 1; i += 1) {
    const [altA, brightA] = TWILIGHT_BRIGHTNESS[i];
    const [altB, brightB] = TWILIGHT_BRIGHTNESS[i + 1];
    if (sunAltitudeDeg <= altA && sunAltitudeDeg >= altB) {
      const t = (sunAltitudeDeg - altA) / (altB - altA);
      return brightA + (brightB - brightA) * t;
    }
  }
  return Number.POSITIVE_INFINITY;
};

/* --------------------------------------------------------------------------
 * 月明かり — Krisciunas & Schaefer (1991)
 * -------------------------------------------------------------------------- */

/** ナノランベルトを mag/arcsec^2 に直す（同論文の式 27）。 */
const nanoLambertToMagPerArcsec2 = (nanoLambert: number): number => {
  if (nanoLambert <= 0) return Number.POSITIVE_INFINITY;
  return (20.7233 - Math.log(nanoLambert / 34.08)) / 0.92104;
};

/** 同論文の大気路程近似（式 3）。 */
const ksAirmass = (zenithDistanceDeg: number): number => {
  const s = Math.sin(zenithDistanceDeg * DEG);
  return (1 - 0.96 * s * s) ** -0.5;
};

/**
 * 月光が作る空の明るさ（mag/arcsec^2）。
 *
 * @param phaseAngleDeg      月の位相角（0 が満月、180 が新月）
 * @param separationDeg      月とその方向との角距離
 * @param moonZenithDeg      月の天頂距離
 * @param targetZenithDeg    見ようとしている方向の天頂距離
 */
export const moonlightBrightness = (
  phaseAngleDeg: number,
  separationDeg: number,
  moonZenithDeg: number,
  targetZenithDeg: number,
): number => {
  // 月が地平線下なら寄与しない。
  if (moonZenithDeg >= 90) return Number.POSITIVE_INFINITY;

  const alpha = Math.abs(phaseAngleDeg);
  // 月の照度（式 20）
  const illuminance = 10 ** (-0.4 * (3.84 + 0.026 * alpha + 4e-9 * alpha ** 4));

  // 散乱関数（式 21）。レイリー散乱とエアロゾルの和。
  const rho = Math.max(separationDeg, 0.5);
  const cosRho = Math.cos(rho * DEG);
  const scattering = 10 ** 5.36 * (1.06 + cosRho * cosRho) + 10 ** (6.15 - rho / 40);

  // 月からの光が受ける減光と、視線方向の大気が散乱に寄与する割合（式 15）
  const k = EXTINCTION_COEFFICIENT;
  const nanoLambert =
    scattering *
    illuminance *
    10 ** (-0.4 * k * ksAirmass(moonZenithDeg)) *
    (1 - 10 ** (-0.4 * k * ksAirmass(Math.min(targetZenithDeg, 89.9))));

  return nanoLambertToMagPerArcsec2(nanoLambert);
};

/* --------------------------------------------------------------------------
 * 合成
 * -------------------------------------------------------------------------- */

/** mag/arcsec^2 を輝度の相対値に直す。 */
const toLuminance = (magPerArcsec2: number): number =>
  Number.isFinite(magPerArcsec2) ? 10 ** (-0.4 * magPerArcsec2) : 0;

const fromLuminance = (luminance: number): number =>
  luminance <= 0 ? Number.POSITIVE_INFINITY : -2.5 * Math.log10(luminance);

export interface SkyConditions {
  /** 太陽の高度（度）。 */
  readonly sunAltitude: number;
  /** 月の高度（度）。地平線下なら負。 */
  readonly moonAltitude: number;
  /** 月の方位角（度）。 */
  readonly moonAzimuth: number;
  /** 月の位相角（度）。0 が満月。 */
  readonly moonPhaseAngle: number;
  /** 月の輝面比（0〜1）。表示用。 */
  readonly moonIllumination: number;
  /** 光害の程度。 */
  readonly environment: SkyEnvironment;
}

/** いまの太陽と月の状態を求める。 */
export const computeSkyConditions = (
  observer: ObserverLocation,
  time: Date,
  environment: SkyEnvironment,
): SkyConditions => {
  const astroObserver = new AstroObserver(observer.latitude, observer.longitude, observer.elevation);

  const sunEq = Equator(Body.Sun, time, astroObserver, true, true);
  const sun = Horizon(time, astroObserver, sunEq.ra, sunEq.dec, 'normal');

  const moonEq = Equator(Body.Moon, time, astroObserver, true, true);
  const moon = Horizon(time, astroObserver, moonEq.ra, moonEq.dec, 'normal');
  const illumination = Illumination(Body.Moon, time);

  return {
    sunAltitude: sun.altitude,
    moonAltitude: moon.altitude,
    moonAzimuth: moon.azimuth,
    moonPhaseAngle: illumination.phase_angle,
    moonIllumination: illumination.phase_fraction,
    environment,
  };
};

/**
 * ある方向の空の明るさ（mag/arcsec^2）。
 * 光害・薄明・月明かりの輝度を足し合わせる。
 */
export const skyBrightnessTowards = (
  conditions: SkyConditions,
  altitudeDeg: number,
  azimuthDeg: number,
): number => {
  const base = SKY_ENVIRONMENTS[conditions.environment].zenithBrightness;

  const separation = angularSeparation(
    altitudeDeg,
    azimuthDeg,
    conditions.moonAltitude,
    conditions.moonAzimuth,
  );

  const luminance =
    toLuminance(base) +
    toLuminance(twilightBrightness(conditions.sunAltitude)) +
    toLuminance(
      moonlightBrightness(
        conditions.moonPhaseAngle,
        separation,
        90 - conditions.moonAltitude,
        90 - altitudeDeg,
      ),
    );

  return fromLuminance(luminance);
};

/** 高度・方位角で与えた 2 方向のなす角（度）。 */
export const angularSeparation = (
  altA: number,
  azA: number,
  altB: number,
  azB: number,
): number => {
  const a1 = altA * DEG;
  const a2 = altB * DEG;
  const dAz = (azA - azB) * DEG;
  const cosine =
    Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * RAD;
};

export interface StarVisibility {
  /** 大気減光を加えた見かけの等級。 */
  readonly apparentMagnitude: number;
  /** その方向での肉眼極限等級。 */
  readonly limit: number;
  /**
   * 見える度合い。0 が「まず見えない」、1 が「はっきり見える」。
   * 極限等級のちょうど境目で 0.5 になるよう、1 等級ぶんの幅で滑らかにつなぐ。
   * 極限等級付近の見え方は個人差が大きく、境目を硬く切ると不自然なため。
   */
  readonly confidence: number;
}

/** 極限等級の境目をなめらかにする幅（等級）。 */
const VISIBILITY_SOFTNESS = 1.0;

export const starVisibility = (
  magnitude: number,
  altitudeDeg: number,
  azimuthDeg: number,
  conditions: SkyConditions,
): StarVisibility => {
  const apparentMagnitude = extinctedMagnitude(magnitude, altitudeDeg);
  const limit = limitingMagnitude(skyBrightnessTowards(conditions, altitudeDeg, azimuthDeg));
  const margin = limit - apparentMagnitude;
  const confidence = 1 / (1 + Math.exp((-margin / VISIBILITY_SOFTNESS) * 4));
  return { apparentMagnitude, limit, confidence };
};

/** 天頂での肉眼極限等級。「いまの空は何等星まで」と表示するのに使う。 */
export const zenithLimitingMagnitude = (conditions: SkyConditions): number =>
  limitingMagnitude(skyBrightnessTowards(conditions, 90, 0));
