/**
 * 可視性モデルの検証。
 * 文献に載っている既知の値と突き合わせて、係数の写し間違いを防ぐ。
 */
import { describe, expect, it } from 'vitest';

import {
  airmass,
  angularSeparation,
  computeSkyConditions,
  extinctedMagnitude,
  limitingMagnitude,
  moonlightBrightness,
  SKY_ENVIRONMENTS,
  skyBrightnessTowards,
  starVisibility,
  zenithLimitingMagnitude,
  type SkyConditions,
} from './visibility';

const TOKYO = { latitude: 35.6812, longitude: 139.7671, elevation: 40 };

/** 月も太陽も出ていない、指定した光害だけの空。 */
const quietSky = (environment: SkyConditions['environment']): SkyConditions => ({
  sunAltitude: -40,
  moonAltitude: -30,
  moonAzimuth: 0,
  moonPhaseAngle: 90,
  moonIllumination: 0.5,
  environment,
});

describe('大気路程 (Kasten & Young 1989)', () => {
  it('天頂で 1.0', () => {
    expect(airmass(90)).toBeCloseTo(1.0, 3);
  });

  it('天頂距離 60° で約 2.0', () => {
    expect(airmass(30)).toBeCloseTo(2.0, 1);
  });

  it('地平線で約 38', () => {
    expect(airmass(0)).toBeGreaterThan(36);
    expect(airmass(0)).toBeLessThan(40);
  });

  it('高度が下がるほど単調に増える', () => {
    let previous = airmass(90);
    for (let alt = 89; alt >= 1; alt -= 1) {
      const current = airmass(alt);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('地平線下では無限大', () => {
    expect(airmass(-10)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('大気減光', () => {
  it('天頂では 0.22 等ぶん暗くなる', () => {
    expect(extinctedMagnitude(1.0, 90)).toBeCloseTo(1.22, 2);
  });

  it('低空ほど大きく減光される', () => {
    // 高度 10° でおよそ 1 等ぶん暗くなる。
    const loss = extinctedMagnitude(1.0, 10) - 1.0;
    expect(loss).toBeGreaterThan(1.0);
    expect(loss).toBeLessThan(1.5);
  });
});

describe('肉眼極限等級 (Schaefer 1990)', () => {
  it('暗い空 21.7 等/平方秒角 でおよそ 6.5 等', () => {
    expect(limitingMagnitude(21.7)).toBeCloseTo(6.5, 1);
  });

  it('市街地 18.0 等/平方秒角 でおよそ 4.0 等', () => {
    expect(limitingMagnitude(18.0)).toBeCloseTo(4.0, 1);
  });

  it('空が明るいほど極限等級は小さくなる', () => {
    expect(limitingMagnitude(19)).toBeLessThan(limitingMagnitude(21));
  });
});

describe('光害の区分', () => {
  it('市街地から暗い空へ向かって単調に暗くなる', () => {
    const order = ['city', 'suburb', 'rural', 'dark'] as const;
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(SKY_ENVIRONMENTS[order[i]].zenithBrightness).toBeLessThan(
        SKY_ENVIRONMENTS[order[i + 1]].zenithBrightness,
      );
    }
  });

  it('市街地では 4 等星、暗い空では 6 等星あたりが限界になる', () => {
    expect(zenithLimitingMagnitude(quietSky('city'))).toBeCloseTo(4.0, 0);
    expect(zenithLimitingMagnitude(quietSky('dark'))).toBeGreaterThan(6.0);
  });
});

describe('薄明', () => {
  it('太陽が沈むほど空が暗くなる', () => {
    const brightness = [-2, -6, -10, -14, -18, -30].map((sunAltitude) =>
      skyBrightnessTowards({ ...quietSky('rural'), sunAltitude }, 90, 0),
    );
    for (let i = 0; i < brightness.length - 1; i += 1) {
      expect(brightness[i]).toBeLessThan(brightness[i + 1]);
    }
  });

  it('天文薄明が終われば光害だけの明るさに落ち着く', () => {
    const dark = skyBrightnessTowards({ ...quietSky('rural'), sunAltitude: -20 }, 90, 0);
    expect(dark).toBeCloseTo(SKY_ENVIRONMENTS.rural.zenithBrightness, 3);
  });

  it('市民薄明では一等星しか残らない', () => {
    const limit = zenithLimitingMagnitude({ ...quietSky('dark'), sunAltitude: -6 });
    expect(limit).toBeGreaterThan(0.5);
    expect(limit).toBeLessThan(2.5);
  });
});

describe('月明かり (Krisciunas & Schaefer 1991)', () => {
  it('月が地平線下なら寄与しない', () => {
    expect(moonlightBrightness(0, 60, 100, 45)).toBe(Number.POSITIVE_INFINITY);
  });

  it('満月が高く昇っているとき、空の明るさが満月の夜の実測値と合う', () => {
    // 満月の夜の空は V で 18 等/平方秒角 前後というのが一般的な実測値。
    // 月から 60° 離れた方向を見た場合。
    const brightness = moonlightBrightness(0, 60, 10, 50);
    expect(brightness).toBeGreaterThan(17.5);
    expect(brightness).toBeLessThan(19.0);
  });

  it('新月に近いほど暗い', () => {
    const full = moonlightBrightness(0, 60, 20, 40);
    const half = moonlightBrightness(90, 60, 20, 40);
    const nearNew = moonlightBrightness(170, 60, 20, 40);
    expect(full).toBeLessThan(half);
    expect(half).toBeLessThan(nearNew);
  });

  it('月に近い方向ほど明るい', () => {
    const near = moonlightBrightness(0, 5, 20, 40);
    const far = moonlightBrightness(0, 120, 20, 40);
    expect(near).toBeLessThan(far);
  });

  it('満月の夜は暗い空でも 4〜5 等星までしか見えなくなる', () => {
    const fullMoonNight: SkyConditions = {
      sunAltitude: -40,
      moonAltitude: 60,
      moonAzimuth: 180,
      moonPhaseAngle: 0,
      moonIllumination: 1,
      environment: 'dark',
    };
    const limit = limitingMagnitude(skyBrightnessTowards(fullMoonNight, 60, 60));
    expect(limit).toBeGreaterThan(3.5);
    expect(limit).toBeLessThan(5.5);
  });
});

describe('角距離', () => {
  it('同じ方向なら 0', () => {
    expect(angularSeparation(30, 100, 30, 100)).toBeCloseTo(0, 6);
  });

  it('天頂と地平線で 90', () => {
    expect(angularSeparation(90, 0, 0, 123)).toBeCloseTo(90, 6);
  });

  it('方位が 180 度違う地平線どうしで 180', () => {
    expect(angularSeparation(0, 0, 0, 180)).toBeCloseTo(180, 6);
  });
});

describe('星ごとの見え方', () => {
  const sky = quietSky('city');

  it('市街地でもベガ（0.03 等）は見える', () => {
    expect(starVisibility(0.03, 70, 90, sky).confidence).toBeGreaterThan(0.9);
  });

  it('市街地では 5 等星は見えない', () => {
    expect(starVisibility(5.0, 70, 90, sky).confidence).toBeLessThan(0.1);
  });

  it('暗い空なら 5 等星も見える', () => {
    expect(starVisibility(5.0, 70, 90, quietSky('dark')).confidence).toBeGreaterThan(0.8);
  });

  it('同じ星でも低空では見えにくくなる', () => {
    const high = starVisibility(2.5, 80, 180, quietSky('suburb')).confidence;
    const low = starVisibility(2.5, 8, 180, quietSky('suburb')).confidence;
    expect(low).toBeLessThan(high);
  });

  it('見え方は 0 と 1 のあいだで単調に変化する', () => {
    let previous = 1;
    for (let mag = -1; mag <= 8; mag += 0.5) {
      const c = starVisibility(mag, 60, 0, quietSky('suburb')).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(previous + 1e-9);
      previous = c;
    }
  });
});

describe('実際の日時から求めた空の状態', () => {
  it('東京の真夜中は太陽が地平線下にある', () => {
    // 2026-08-01 15:00 UTC = 8月2日 0時 JST
    const conditions = computeSkyConditions(TOKYO, new Date('2026-08-01T15:00:00Z'), 'city');
    expect(conditions.sunAltitude).toBeLessThan(-15);
  });

  it('東京の正午は太陽が高い', () => {
    // 2026-08-01 03:00 UTC = 12時 JST
    const conditions = computeSkyConditions(TOKYO, new Date('2026-08-01T03:00:00Z'), 'city');
    expect(conditions.sunAltitude).toBeGreaterThan(50);
    // 昼間は星が見えない。
    expect(zenithLimitingMagnitude(conditions)).toBeLessThan(0);
  });

  it('月の輝面比が 0〜1 に収まる', () => {
    for (let day = 1; day <= 28; day += 3) {
      const conditions = computeSkyConditions(
        TOKYO,
        new Date(`2026-06-${String(day).padStart(2, '0')}T15:00:00Z`),
        'city',
      );
      expect(conditions.moonIllumination).toBeGreaterThanOrEqual(0);
      expect(conditions.moonIllumination).toBeLessThanOrEqual(1);
      expect(conditions.moonPhaseAngle).toBeGreaterThanOrEqual(0);
      expect(conditions.moonPhaseAngle).toBeLessThanOrEqual(180);
    }
  });

  it('満月の前後で輝面比が 1 に近づく', () => {
    // 2026 年 6 月の満月は 6 月 30 日ごろ。
    const conditions = computeSkyConditions(TOKYO, new Date('2026-06-30T00:00:00Z'), 'city');
    expect(conditions.moonIllumination).toBeGreaterThan(0.9);
  });
});
