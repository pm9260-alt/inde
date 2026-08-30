/**
 * 座標変換の検証。
 *
 * ここでの狙いは「実装が動くこと」ではなく「向きが正しいこと」の確認。
 * 軸の取り違えや符号ミスは実機に出るまで気づけないので、
 * astronomy-engine の高水準 API（DefineStar → Equator → Horizon）という
 * 完全に別経路の答えと突き合わせる。
 */
import { Body, DefineStar, Equator, Horizon, Observer as AstroObserver } from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import {
  altitudeOf,
  azimuthOf,
  angleBetween,
  applyHeadingOffset,
  enuFromAltAz,
  normalize,
  quatFromMat3,
  QUAT_IDENTITY,
  rotate,
  rotateInverse,
  vec,
  type Mat3,
} from './math';
import { computeSkySnapshot, directionAt, starByHr, starIndexByHr } from './sky';

const TOKYO = { latitude: 35.6812, longitude: 139.7671, elevation: 40 };
const OSLO = { latitude: 59.9139, longitude: 10.7522, elevation: 20 };
const SYDNEY = { latitude: -33.8688, longitude: 151.2093, elevation: 20 };

/** 星表の HR 番号 */
const HR = {
  polaris: 424,
  betelgeuse: 2061,
  rigel: 1713,
  vega: 7001,
  antares: 6134,
  alnilam: 1903,
  dubhe: 4301,
} as const;

describe('ENU と高度方位角の相互変換', () => {
  it('高度・方位角を往復しても元に戻る', () => {
    const cases = [
      [0, 0],
      [45, 90],
      [10, 180],
      [-20, 270],
      [80, 33.3],
      [30, 359.9],
    ];
    for (const [alt, az] of cases) {
      const v = enuFromAltAz(alt, az);
      expect(altitudeOf(v)).toBeCloseTo(alt, 9);
      expect(azimuthOf(v)).toBeCloseTo(az, 9);
    }
  });

  it('方位角 0 は北（+y）、90 は東（+x）を向く', () => {
    const north = enuFromAltAz(0, 0);
    expect(north.y).toBeCloseTo(1, 12);
    expect(north.x).toBeCloseTo(0, 12);
    const east = enuFromAltAz(0, 90);
    expect(east.x).toBeCloseTo(1, 12);
    expect(east.y).toBeCloseTo(0, 12);
  });

  it('天頂は +z', () => {
    expect(enuFromAltAz(90, 0).z).toBeCloseTo(1, 12);
  });
});

/**
 * 星表と同じ赤経赤緯を astronomy-engine のユーザー定義星として登録し、
 * ライブラリ自身の Equator(ofdate) → Horizon 経路で高度方位角を出す。
 * こちらは回転行列を一切使わないので、独立した検算になる。
 */
const referenceAltAz = (
  hr: number,
  observer: { latitude: number; longitude: number; elevation: number },
  time: Date,
  aberration: boolean,
): { altitude: number; azimuth: number } => {
  const star = starByHr(hr);
  DefineStar(Body.Star1, star.ra / 15, star.dec, 1000);
  const astroObserver = new AstroObserver(observer.latitude, observer.longitude, observer.elevation);
  const equatorial = Equator(Body.Star1, time, astroObserver, true, aberration);
  const horizontal = Horizon(time, astroObserver, equatorial.ra, equatorial.dec, 'normal');
  return { altitude: horizontal.altitude, azimuth: horizontal.azimuth };
};

describe('星の地平座標', () => {
  const times = [
    new Date('2026-01-15T12:00:00Z'),
    new Date('2026-07-04T15:30:00Z'),
    new Date('2026-12-31T21:45:00Z'),
    new Date('2031-03-21T06:00:00Z'),
  ];
  const sites = [
    ['東京', TOKYO],
    ['オスロ', OSLO],
    ['シドニー', SYDNEY],
  ] as const;
  const stars = [HR.betelgeuse, HR.rigel, HR.vega, HR.antares, HR.dubhe, HR.polaris];

  for (const [siteName, site] of sites) {
    for (const time of times) {
      it(`${siteName} / ${time.toISOString()} でライブラリ本体の計算と 0.002° 以内で一致する`, () => {
        const snapshot = computeSkySnapshot(site, time);
        for (const hr of stars) {
          const mine = directionAt(snapshot, starIndexByHr(hr));
          const reference = referenceAltAz(hr, site, time, false);
          if (reference.altitude < 0) continue;
          const expected = enuFromAltAz(reference.altitude, reference.azimuth);
          expect(angleBetween(mine, expected)).toBeLessThan(0.002);
        }
      });
    }
  }

  it('年周光行差を無視した誤差は 0.006° 未満に収まる', () => {
    // Rotation_EQJ_HOR は座標系の回転だけを行い、地球の公転による光行差
    // （最大 20.5 秒角 = 0.0057°）は含まない。本アプリの表示誤差目標 0.3° に
    // 対して 1/50 以下なので、あえて補正しない。その差がこの範囲であることを
    // 固定して、将来の変更で無自覚に増えないようにする。
    const time = new Date('2026-07-04T15:30:00Z');
    const snapshot = computeSkySnapshot(TOKYO, time);
    let worst = 0;
    for (const hr of [HR.vega, HR.antares, HR.dubhe]) {
      const reference = referenceAltAz(hr, TOKYO, time, true);
      if (reference.altitude < 0) continue;
      const expected = enuFromAltAz(reference.altitude, reference.azimuth);
      worst = Math.max(worst, angleBetween(directionAt(snapshot, starIndexByHr(hr)), expected));
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.006);
  });

  it('北極星の高度はほぼ観測地の緯度に等しい', () => {
    const time = new Date('2026-05-01T13:00:00Z');
    for (const site of [TOKYO, OSLO]) {
      const snapshot = computeSkySnapshot(site, time);
      const altitude = altitudeOf(directionAt(snapshot, starIndexByHr(HR.polaris)));
      // 北極星は天の北極から約 0.7° 離れているので、その分の幅を見込む。
      expect(Math.abs(altitude - site.latitude)).toBeLessThan(1.0);
    }
  });

  it('オリオン座の三つ星は 1.5° 以内に一直線に並ぶ', () => {
    const snapshot = computeSkySnapshot(TOKYO, new Date('2026-01-15T12:00:00Z'));
    const mintaka = directionAt(snapshot, starIndexByHr(1852));
    const alnilam = directionAt(snapshot, starIndexByHr(HR.alnilam));
    const alnitak = directionAt(snapshot, starIndexByHr(1948));
    // 端から端までの角距離と、中央の星を経由した距離がほぼ等しければ一直線。
    const span = angleBetween(mintaka, alnitak);
    const viaCenter = angleBetween(mintaka, alnilam) + angleBetween(alnilam, alnitak);
    expect(viaCenter - span).toBeLessThan(0.05);
    // 三つ星の全長は約 2.7°。
    expect(span).toBeGreaterThan(2.5);
    expect(span).toBeLessThan(3.0);
  });

  it('シドニー（南半球）ではオリオン座が北の空に見える', () => {
    // 南半球の 1 月、現地の夜半前。
    const snapshot = computeSkySnapshot(SYDNEY, new Date('2026-01-15T12:00:00Z'));
    const azimuth = azimuthOf(directionAt(snapshot, starIndexByHr(HR.alnilam)));
    expect(azimuth > 300 || azimuth < 60).toBe(true);
  });
});

describe('姿勢クォータニオン', () => {
  /** 行が ENU の東・北・天頂を端末座標で表した行列を作る。 */
  const attitudeFromAxes = (east: Vec3Like, north: Vec3Like, up: Vec3Like): Mat3 =>
    [east.x, east.y, east.z, north.x, north.y, north.z, up.x, up.y, up.z] as Mat3;
  type Vec3Like = { x: number; y: number; z: number };

  it('端末を垂直に立てて北を向けたとき、光軸が北を指す', () => {
    // 端末を縦持ちで垂直に立て、背面カメラを北へ向けた状態。
    //   端末の右 (+x) → 東,  端末の上 (+y) → 天頂,  端末の手前 (+z) → 南
    // よって東 = (1,0,0)_dev, 北 = (0,0,-1)_dev, 天頂 = (0,1,0)_dev。
    const q = quatFromMat3(
      attitudeFromAxes(vec(1, 0, 0), vec(0, 0, -1), vec(0, 1, 0)),
    );
    const opticalAxis = rotate(q, vec(0, 0, -1));
    expect(altitudeOf(opticalAxis)).toBeCloseTo(0, 6);
    expect(azimuthOf(opticalAxis)).toBeCloseTo(0, 6);
    // 画面の上は天頂を向いている。
    const screenUp = rotate(q, vec(0, 1, 0));
    expect(altitudeOf(screenUp)).toBeCloseTo(90, 6);
  });

  it('端末を水平に構えて画面を伏せたとき、光軸が天頂を指す', () => {
    // 端末を水平に持ち、画面を地面へ向けて背面カメラを真上に向けた状態。
    // 上辺 (+y) を北へ向けたとすると、+z は地面を向く。端末座標は右手系
    // （x × y = z）なので +x = y × z = 北 × 下 = 西。
    //   東 = (-1,0,0)_dev,  北 = (0,1,0)_dev,  天頂 = (0,0,-1)_dev
    const q = quatFromMat3(
      attitudeFromAxes(vec(-1, 0, 0), vec(0, 1, 0), vec(0, 0, -1)),
    );
    expect(altitudeOf(rotate(q, vec(0, 0, -1)))).toBeCloseTo(90, 6);
    // 画面の上辺は北を向いている。
    expect(azimuthOf(rotate(q, vec(0, 1, 0)))).toBeCloseTo(0, 6);
  });

  it('回転と逆回転が打ち消し合う', () => {
    const q = quatFromMat3(
      attitudeFromAxes(vec(1, 0, 0), vec(0, 0, -1), vec(0, 1, 0)),
    );
    const original = normalize(vec(0.3, -0.5, 0.81));
    expect(original).not.toBeNull();
    const roundTrip = rotateInverse(q, rotate(q, original!));
    expect(angleBetween(roundTrip, original!)).toBeLessThan(1e-9);
  });

  it('方位補正は東向きを正として方位角を増やす', () => {
    // 単位クォータニオンのとき、光軸 (0,0,-1)_dev は ENU の (0,0,-1)、
    // すなわち真下を向く。方位が定義できるよう、まず北を向く姿勢を作る。
    const northFacing = quatFromMat3(
      attitudeFromAxes(vec(1, 0, 0), vec(0, 0, -1), vec(0, 1, 0)),
    );
    const shifted = applyHeadingOffset(northFacing, 10);
    expect(azimuthOf(rotate(shifted, vec(0, 0, -1)))).toBeCloseTo(10, 6);

    const west = applyHeadingOffset(northFacing, -7.5);
    expect(azimuthOf(rotate(west, vec(0, 0, -1)))).toBeCloseTo(352.5, 6);
  });

  it('補正 0 度は姿勢を変えない', () => {
    expect(applyHeadingOffset(QUAT_IDENTITY, 0)).toBe(QUAT_IDENTITY);
  });
});
