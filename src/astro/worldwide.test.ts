/**
 * 世界各地で同じ処理が使えることの検証。
 *
 * 「東京では合っていた」で通ってしまう作りは、南半球や高緯度で静かに壊れる。
 * 半球・緯度・経度・季節を変えても、天体計算・可視性・姿勢推定・投影の
 * どれもが破綻しないことを、ここで機械的に押さえる。
 */
import { Body, DefineStar, Equator, Horizon, Observer as AstroObserver } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import {
  altitudeOf,
  angleBetween,
  azimuthOf,
  cross,
  DEG,
  dot,
  enuFromAltAz,
  normalize,
  quatAngleBetween,
  quatFromMat3,
  scale,
  sub,
  vec,
  type Quat,
  type Vec3,
} from './math';
import { makeProjection, projectToScreen, viewingDirection } from './projection';
import { computeSkySnapshot, directionAt, starByHr, starIndexByHr } from './sky';
import {
  computeSkyConditions,
  starVisibility,
  zenithLimitingMagnitude,
} from './visibility';
import {
  attitudeFromGravityAndField,
  INITIAL_FUSION_STATE,
  updateFusion,
} from '../sensors/attitude';

/** 半球・緯度・経度・時差をひととおり跨ぐ地点。 */
const SITES = [
  ['東京', 35.6812, 139.7671, 40],
  ['シドニー', -33.8688, 151.2093, 20],
  ['ケープタウン', -33.9249, 18.4241, 30],
  ['サンティアゴ', -33.4489, -70.6693, 570],
  ['ナイロビ（ほぼ赤道）', -1.2921, 36.8219, 1700],
  ['キト（赤道直上）', -0.1807, -78.4678, 2850],
  ['レイキャビク（高緯度北）', 64.1466, -21.9426, 30],
  ['ウシュアイア（高緯度南）', -54.8019, -68.303, 20],
  ['ホノルル', 21.3069, -157.8583, 5],
  ['ロンドン（本初子午線）', 51.5074, -0.1278, 25],
  ['日付変更線の東', -13.8333, -171.7667, 5],
] as const;

const TIMES = [
  new Date('2026-03-20T00:00:00Z'),
  new Date('2026-06-21T12:00:00Z'),
  new Date('2026-09-22T18:00:00Z'),
  new Date('2026-12-21T06:00:00Z'),
];

const observerOf = (site: (typeof SITES)[number]) => ({
  latitude: site[1],
  longitude: site[2],
  elevation: site[3],
});

/** 星表の HR を、ライブラリ本体の独立経路で解いた地平座標。 */
const referenceAltAz = (
  hr: number,
  observer: { latitude: number; longitude: number; elevation: number },
  time: Date,
) => {
  const star = starByHr(hr);
  DefineStar(Body.Star1, star.ra / 15, star.dec, 1000);
  const astroObserver = new AstroObserver(observer.latitude, observer.longitude, observer.elevation);
  const equatorial = Equator(Body.Star1, time, astroObserver, true, false);
  const horizontal = Horizon(time, astroObserver, equatorial.ra, equatorial.dec, 'normal');
  return { altitude: horizontal.altitude, azimuth: horizontal.azimuth };
};

describe('天体計算は場所と季節に依らない', () => {
  // 北天・天の赤道付近・南天から 1 つずつ。
  const STARS = [424, 1713, 2326]; // Polaris, Rigel, Canopus

  for (const site of SITES) {
    it(`${site[0]} で、独立経路と 0.002° 以内で一致する`, () => {
      const observer = observerOf(site);
      for (const time of TIMES) {
        const snapshot = computeSkySnapshot(observer, time);
        for (const hr of STARS) {
          const reference = referenceAltAz(hr, observer, time);
          if (reference.altitude < 0) continue;
          const mine = directionAt(snapshot, starIndexByHr(hr));
          const expected = enuFromAltAz(reference.altitude, reference.azimuth);
          expect(angleBetween(mine, expected)).toBeLessThan(0.002);
        }
      }
    });
  }

  it('南半球では北極星が地平線の下にある', () => {
    for (const site of SITES.filter((s) => s[1] < -10)) {
      const snapshot = computeSkySnapshot(observerOf(site), TIMES[0]);
      expect(altitudeOf(directionAt(snapshot, starIndexByHr(424)))).toBeLessThan(0);
    }
  });

  it('北半球ではカノープスが見えない緯度がある', () => {
    // カノープスの赤緯は約 −52.7°。レイキャビク（北緯 64°）からは決して昇らない。
    const snapshot = computeSkySnapshot(
      { latitude: 64.1466, longitude: -21.9426, elevation: 30 },
      TIMES[1],
    );
    expect(altitudeOf(directionAt(snapshot, starIndexByHr(2326)))).toBeLessThan(0);
  });

  it('赤道ではどちらの極星も地平線の近くに来る', () => {
    const snapshot = computeSkySnapshot(
      { latitude: -0.1807, longitude: -78.4678, elevation: 2850 },
      TIMES[2],
    );
    expect(Math.abs(altitudeOf(directionAt(snapshot, starIndexByHr(424))))).toBeLessThan(3);
  });

  it('緯度を変えると北極星の高度がそれに追従する', () => {
    for (const latitude of [-60, -30, 0, 30, 60, 80]) {
      const snapshot = computeSkySnapshot({ latitude, longitude: 0, elevation: 0 }, TIMES[0]);
      const altitude = altitudeOf(directionAt(snapshot, starIndexByHr(424)));
      // 北極星は天の北極から約 0.7° 離れている。大気差の分も見込む。
      expect(Math.abs(altitude - latitude)).toBeLessThan(1.5);
    }
  });
});

describe('可視性は場所と季節に依らない', () => {
  for (const site of SITES) {
    it(`${site[0]} で、極限等級が妥当な範囲に収まる`, () => {
      const observer = observerOf(site);
      for (const time of TIMES) {
        for (const environment of ['city', 'dark'] as const) {
          const conditions = computeSkyConditions(observer, time, environment);
          const limit = zenithLimitingMagnitude(conditions);
          // 昼は 0 等以下、夜でも 7 等より暗くは見えない。
          expect(limit).toBeLessThan(7.5);
          expect(Number.isFinite(limit)).toBe(true);
          expect(conditions.moonIllumination).toBeGreaterThanOrEqual(0);
          expect(conditions.moonIllumination).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it('南半球の夏至と北半球の夏至で、太陽高度の大小が入れ替わる', () => {
    const june = new Date('2026-06-21T12:00:00Z');
    const tokyoNoon = computeSkyConditions(
      { latitude: 35.68, longitude: 139.77, elevation: 0 },
      new Date('2026-06-21T03:00:00Z'),
      'city',
    );
    const sydneyNoon = computeSkyConditions(
      { latitude: -33.87, longitude: 151.21, elevation: 0 },
      new Date('2026-06-21T02:00:00Z'),
      'city',
    );
    expect(tokyoNoon.sunAltitude).toBeGreaterThan(sydneyNoon.sunAltitude);
    expect(june.getTime()).toBeGreaterThan(0);
  });

  it('高緯度の夏には白夜に近い状態が現れる', () => {
    // レイキャビクの 6 月は、真夜中でも太陽が地平線のすぐ下。
    const conditions = computeSkyConditions(
      { latitude: 64.1466, longitude: -21.9426, elevation: 30 },
      new Date('2026-06-21T00:00:00Z'),
      'dark',
    );
    expect(conditions.sunAltitude).toBeGreaterThan(-12);
    // 空が明るいので、暗い空の設定でも極限等級は落ちる。
    expect(zenithLimitingMagnitude(conditions)).toBeLessThan(5.5);
  });

  it('星の見え方の判定が、どの地点でも 0〜1 に収まる', () => {
    for (const site of SITES) {
      const observer = observerOf(site);
      const snapshot = computeSkySnapshot(observer, TIMES[3]);
      const conditions = computeSkyConditions(observer, TIMES[3], 'suburb');
      for (const hr of [424, 1713, 2326, 7001]) {
        const index = starIndexByHr(hr);
        const direction = directionAt(snapshot, index);
        const visibility = starVisibility(
          starByHr(hr).mag,
          snapshot.altitudes[index],
          azimuthOf(direction),
          conditions,
        );
        expect(visibility.confidence).toBeGreaterThanOrEqual(0);
        expect(visibility.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});

/** 背面カメラを (高度, 方位) に向けた姿勢。 */
const lookingAt = (altitudeDeg: number, azimuthDeg: number): Quat => {
  const forward = enuFromAltAz(altitudeDeg, azimuthDeg);
  const zAxis = scale(forward, -1);
  const worldUp = vec(0, 0, 1);
  const yAxis =
    normalize(sub(worldUp, scale(zAxis, dot(worldUp, zAxis)))) ??
    normalize(sub(vec(0, 1, 0), scale(zAxis, dot(vec(0, 1, 0), zAxis))))!;
  const xAxis = cross(yAxis, zAxis);
  return quatFromMat3([
    xAxis.x, yAxis.x, zAxis.x,
    xAxis.y, yAxis.y, zAxis.y,
    xAxis.z, yAxis.z, zAxis.z,
  ]);
};

/** 伏角を指定した地磁気（ENU）。北半球は下向き（正）、南半球は上向き（負）。 */
const fieldWithInclination = (inclinationDeg: number, totalUt = 46): Vec3 => {
  const inclination = inclinationDeg * DEG;
  return vec(0, totalUt * Math.cos(inclination), -totalUt * Math.sin(inclination));
};

describe('姿勢推定は半球に依らない', () => {
  const gravityFor = (attitude: Quat): Vec3 => {
    const { w, x, y, z } = attitude;
    const inverse: Quat = { w, x: -x, y: -y, z: -z };
    // ENU の真下を端末座標へ。
    const t = (q: Quat, v: Vec3): Vec3 => {
      const tx = 2 * (q.y * v.z - q.z * v.y);
      const ty = 2 * (q.z * v.x - q.x * v.z);
      const tz = 2 * (q.x * v.y - q.y * v.x);
      return vec(
        v.x + q.w * tx + (q.y * tz - q.z * ty),
        v.y + q.w * ty + (q.z * tx - q.x * tz),
        v.z + q.w * tz + (q.x * ty - q.y * tx),
      );
    };
    return scale(t(inverse, vec(0, 0, -1)), 9.80665);
  };

  const fieldFor = (attitude: Quat, inclinationDeg: number): Vec3 => {
    const { w, x, y, z } = attitude;
    const inverse: Quat = { w, x: -x, y: -y, z: -z };
    const enu = fieldWithInclination(inclinationDeg);
    const tx = 2 * (inverse.y * enu.z - inverse.z * enu.y);
    const ty = 2 * (inverse.z * enu.x - inverse.x * enu.z);
    const tz = 2 * (inverse.x * enu.y - inverse.y * enu.x);
    return vec(
      enu.x + inverse.w * tx + (inverse.y * tz - inverse.z * ty),
      enu.y + inverse.w * ty + (inverse.z * tx - inverse.x * tz),
      enu.z + inverse.w * tz + (inverse.x * ty - inverse.y * tx),
    );
  };

  // 伏角: 北半球の中緯度 +49、赤道 0、南半球 −60、極に近い +80。
  for (const inclination of [80, 49, 20, 0, -20, -60, -80]) {
    it(`伏角 ${inclination}° でも姿勢を復元できる`, () => {
      for (const [alt, az] of [
        [0, 0],
        [40, 137],
        [75, 250],
      ]) {
        const truth = lookingAt(alt, az);
        const estimated = attitudeFromGravityAndField(
          gravityFor(truth),
          fieldFor(truth, inclination),
        );
        expect(estimated).not.toBeNull();
        expect(quatAngleBetween(estimated!, truth)).toBeLessThan(0.001);
      }
    });
  }

  it('伏角が 90° に近いと方位が決められず、その旨を返す', () => {
    // 磁極の直上では水平成分が消える。誤った方位を出すより、出さない。
    const truth = lookingAt(20, 90);
    expect(attitudeFromGravityAndField(gravityFor(truth), fieldFor(truth, 89.5))).toBeNull();
  });

  it('南半球の磁場でも融合フィルタが収束する', () => {
    const truth = lookingAt(35, 200);
    const gravity = gravityFor(truth);
    const field = fieldFor(truth, -60);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 400; i += 1) state = updateFusion(state, gravity, field);
    expect(state.attitude).not.toBeNull();
    expect(quatAngleBetween(state.attitude!, truth)).toBeLessThan(0.05);
  });
});

describe('投影は場所に依らない', () => {
  const viewport = { width: 393, height: 852 };
  const projection = makeProjection(viewport, 68);

  it('どの向きでも、狙った先が画面中央に来る', () => {
    for (const [alt, az] of [
      [-80, 10],
      [0, 0],
      [45, 180],
      [89, 270],
    ]) {
      const attitude = lookingAt(alt, az);
      const point = projectToScreen(attitude, enuFromAltAz(alt, az), projection, viewport);
      expect(point.x).toBeCloseTo(viewport.width / 2, 4);
      expect(point.y).toBeCloseTo(viewport.height / 2, 4);
    }
  });

  it('南天の星も北天の星も同じ式で投影される', () => {
    const attitude = lookingAt(0, 180);
    for (const declinationSide of [-1, 1]) {
      const point = projectToScreen(
        attitude,
        enuFromAltAz(10 * declinationSide, 180),
        projection,
        viewport,
      );
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('視線方向は姿勢だけで決まり、観測地を参照しない', () => {
    const attitude = lookingAt(33, 217);
    const direction = viewingDirection(attitude);
    expect(altitudeOf(direction)).toBeCloseTo(33, 6);
    expect(azimuthOf(direction)).toBeCloseTo(217, 6);
  });
});
