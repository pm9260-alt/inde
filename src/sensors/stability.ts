/**
 * 姿勢の安定性とドリフトを測る。
 *
 * 精度は「どれだけ正しい方を向くか」だけでは決まらない。端末を置いたまま
 * 値が揺れれば星は震えて見えるし、少しずつ流れれば、合わせたはずの空が
 * 数分後にはずれている。前者を「ゆらぎ」、後者を「ドリフト」として分けて測る。
 *
 * どちらも視線方向の方位と高度で見る。姿勢そのものの角度差より、
 * 「空のどこを指しているか」のほうが、実際の見え方に直結するため。
 */
import { altitudeOf, azimuthOf, type Quat } from '../astro/math';
import { viewingDirection } from '../astro/projection';

/** −180〜180 に畳む。 */
const wrapDegrees = (degrees: number): number => ((degrees + 540) % 360) - 180;

interface Reading {
  readonly azimuth: number;
  readonly altitude: number;
  readonly at: number;
}

export interface StabilitySummary {
  /** 窓のあいだの方位の振れ幅（度）。端末を置いていれば、これがノイズ。 */
  readonly azimuthSpreadDeg: number;
  /** 同、高度。 */
  readonly altitudeSpreadDeg: number;
  readonly sampleCount: number;
  readonly windowSeconds: number;
}

export const EMPTY_STABILITY: StabilitySummary = {
  azimuthSpreadDeg: 0,
  altitudeSpreadDeg: 0,
  sampleCount: 0,
  windowSeconds: 0,
};

/**
 * 直近の一定時間ぶんの姿勢を溜めて、振れ幅を出す。
 * 窓を時間で切るので、取得間隔が変わっても意味が変わらない。
 */
export class StabilityWindow {
  private readonly readings: Reading[] = [];

  constructor(private readonly windowMs = 3000) {}

  push(attitude: Quat, now: number): void {
    const view = viewingDirection(attitude);
    this.readings.push({ azimuth: azimuthOf(view), altitude: altitudeOf(view), at: now });
    while (this.readings.length > 0 && now - this.readings[0].at > this.windowMs) {
      this.readings.shift();
    }
  }

  clear(): void {
    this.readings.length = 0;
  }

  summary(): StabilitySummary {
    if (this.readings.length < 2) return EMPTY_STABILITY;
    const base = this.readings[0].azimuth;
    let minAzimuth = 0;
    let maxAzimuth = 0;
    let minAltitude = this.readings[0].altitude;
    let maxAltitude = this.readings[0].altitude;

    for (const reading of this.readings) {
      // 0 度をまたいでも振れ幅が 360° にならないよう、先頭からの差で見る。
      const relative = wrapDegrees(reading.azimuth - base);
      if (relative < minAzimuth) minAzimuth = relative;
      if (relative > maxAzimuth) maxAzimuth = relative;
      if (reading.altitude < minAltitude) minAltitude = reading.altitude;
      if (reading.altitude > maxAltitude) maxAltitude = reading.altitude;
    }

    const last = this.readings[this.readings.length - 1];
    return {
      azimuthSpreadDeg: maxAzimuth - minAzimuth,
      altitudeSpreadDeg: maxAltitude - minAltitude,
      sampleCount: this.readings.length,
      windowSeconds: (last.at - this.readings[0].at) / 1000,
    };
  }
}

export interface DriftReference {
  readonly attitude: Quat;
  readonly at: number;
}

export interface DriftSummary {
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
  readonly totalDeg: number;
  readonly elapsedSeconds: number;
  /** 方位のドリフト速度（度/分）。経過が短いあいだは null。 */
  readonly azimuthPerMinute: number | null;
}

/** 基準を取ってからどれだけ流れたか。端末を動かさずに測ること。 */
export const measureDrift = (
  reference: DriftReference,
  attitude: Quat,
  now: number,
): DriftSummary => {
  const from = viewingDirection(reference.attitude);
  const to = viewingDirection(attitude);
  const azimuthDeg = wrapDegrees(azimuthOf(to) - azimuthOf(from));
  const altitudeDeg = altitudeOf(to) - altitudeOf(from);
  const elapsedSeconds = Math.max(0, (now - reference.at) / 1000);
  return {
    azimuthDeg,
    altitudeDeg,
    totalDeg: Math.hypot(azimuthDeg, altitudeDeg),
    elapsedSeconds,
    // 経過が短いうちは速度に意味がない。
    azimuthPerMinute: elapsedSeconds >= 10 ? (azimuthDeg / elapsedSeconds) * 60 : null,
  };
};
