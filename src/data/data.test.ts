/**
 * データの整合性。
 *
 * 星座線は HR 番号を手で書いているので、打ち間違いは実機に出すまで
 * 気づけない。ここで機械的に潰しておく。
 */
import { describe, expect, it } from 'vitest';

import { computeSkySnapshot, directionAt, starIndexByHr } from '../astro/sky';
import { angleBetween } from '../astro/math';
import { ASTERISMS, asterismStarHrs } from './constellations';
import { MYTHS, mythById } from './myths';
import { STAR_CATALOG } from './stars.generated';

const catalogHrs = new Set(STAR_CATALOG.map((s) => s.hr));

describe('星表', () => {
  it('HR 番号が重複していない', () => {
    expect(catalogHrs.size).toBe(STAR_CATALOG.length);
  });

  it('赤経赤緯と等級が妥当な範囲にある', () => {
    for (const star of STAR_CATALOG) {
      expect(star.ra).toBeGreaterThanOrEqual(0);
      expect(star.ra).toBeLessThan(360);
      expect(star.dec).toBeGreaterThanOrEqual(-90);
      expect(star.dec).toBeLessThanOrEqual(90);
      expect(star.mag).toBeLessThanOrEqual(4.5);
      expect(star.mag).toBeGreaterThan(-2);
    }
  });

  it('色は 0〜1 の 3 成分で、最大成分が 1 に正規化されている', () => {
    for (const star of STAR_CATALOG) {
      expect(star.color).toHaveLength(3);
      for (const c of star.color) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...star.color)).toBeCloseTo(1, 2);
    }
  });

  it('よく知られた星の位置が実際の値と一致する', () => {
    // 目視で検算できる代表値。星表を作り直したときの取り違えを検出する。
    const expected: [number, string, number, number, number][] = [
      // HR, 名前, 赤経(度), 赤緯(度), V等級
      [2061, 'Betelgeuse', 88.793, 7.407, 0.5],
      [1713, 'Rigel', 78.635, -8.202, 0.12],
      [7001, 'Vega', 279.235, 38.784, 0.03],
      [7557, 'Altair', 297.696, 8.868, 0.77],
      [7924, 'Deneb', 310.358, 45.28, 1.25],
      [6134, 'Antares', 247.352, -26.432, 0.96],
      [424, 'Polaris', 37.955, 89.264, 2.02],
    ];
    for (const [hr, name, ra, dec, mag] of expected) {
      const star = STAR_CATALOG[starIndexByHr(hr)];
      expect(star.name).toBe(name);
      expect(star.ra).toBeCloseTo(ra, 2);
      expect(star.dec).toBeCloseTo(dec, 2);
      expect(star.mag).toBeCloseTo(mag, 2);
    }
  });
});

describe('星座の定義', () => {
  it('星座 ID が重複していない', () => {
    const ids = ASTERISMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const asterism of ASTERISMS) {
    describe(asterism.nameJa, () => {
      it('参照するすべての星が星表にある', () => {
        for (const hr of asterismStarHrs(asterism)) {
          expect(catalogHrs.has(hr), `HR ${hr} が星表にない`).toBe(true);
        }
      });

      it('ラベルを置く星が構成星に含まれる', () => {
        expect(asterismStarHrs(asterism)).toContain(asterism.labelHr);
      });

      it('星座線が自己ループになっていない', () => {
        for (const [a, b] of asterism.lines) expect(a).not.toBe(b);
      });

      it('同じ線が二重に引かれていない', () => {
        const keys = asterism.lines.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
        expect(new Set(keys).size).toBe(keys.length);
      });

      it('星座線が一つながりになっている', () => {
        // 線でつながる星の集合がひとかたまりであること。
        // 離れた星を結び忘れると、画面上で図が分断される。
        const adjacency = new Map<number, number[]>();
        for (const [a, b] of asterism.lines) {
          adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
          adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
        }
        const start = asterism.lines[0][0];
        const seen = new Set<number>([start]);
        const stack = [start];
        while (stack.length > 0) {
          for (const next of adjacency.get(stack.pop()!) ?? []) {
            if (!seen.has(next)) {
              seen.add(next);
              stack.push(next);
            }
          }
        }
        expect(seen.size).toBe(adjacency.size);
      });

      it('構成星どうしが空の上で近くにまとまっている', () => {
        // HR 番号を打ち間違えると、まったく別の方向の星を拾ってしまう。
        // 星座の広がりが 60° を超えていたら間違いとみなす。
        const snapshot = computeSkySnapshot(
          { latitude: 35.68, longitude: 139.77, elevation: 40 },
          new Date('2026-01-01T00:00:00Z'),
        );
        const directions = asterismStarHrs(asterism).map((hr) =>
          directionAt(snapshot, starIndexByHr(hr)),
        );
        let widest = 0;
        for (let i = 0; i < directions.length; i += 1) {
          for (let j = i + 1; j < directions.length; j += 1) {
            widest = Math.max(widest, angleBetween(directions[i], directions[j]));
          }
        }
        expect(widest).toBeLessThan(60);
      });

      it('星座線がつなぐ 2 星が離れすぎていない', () => {
        // 星座（constellation）は figure が実物大の生き物や人のかたちなので
        // 隣り合う星は 30° 以内に収まる。一方、夏の大三角のような
        // アステリズムは離れた一等星どうしを結ぶため、もっと広い。
        // デネブとアルタイルは実際に約 38° 離れている。
        const limit = asterism.kind === 'constellation' ? 30 : 45;
        const snapshot = computeSkySnapshot(
          { latitude: 35.68, longitude: 139.77, elevation: 40 },
          new Date('2026-01-01T00:00:00Z'),
        );
        for (const [a, b] of asterism.lines) {
          const separation = angleBetween(
            directionAt(snapshot, starIndexByHr(a)),
            directionAt(snapshot, starIndexByHr(b)),
          );
          expect(
            separation,
            `HR ${a} と HR ${b} が ${separation.toFixed(1)}° 離れている`,
          ).toBeLessThan(limit);
        }
      });

      it('結びついた物語が存在する', () => {
        expect(() => mythById(asterism.mythId)).not.toThrow();
      });
    });
  }
});

describe('神話コンテンツ', () => {
  it('物語 ID が重複していない', () => {
    const ids = MYTHS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const myth of MYTHS) {
    describe(myth.title, () => {
      it('場面が 3 つ以上ある', () => {
        expect(myth.scenes.length).toBeGreaterThanOrEqual(3);
      });

      it('場面 ID が重複していない', () => {
        const ids = myth.scenes.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('本文が立ち読みできる長さに収まっている', () => {
        for (const scene of myth.scenes) {
          expect(scene.body.length).toBeGreaterThan(20);
          // 夜空の下で読む前提。1 場面が長すぎると体験が止まる。
          expect(scene.body.length, `${scene.id} が長すぎる`).toBeLessThanOrEqual(160);
        }
      });

      it('視線を向ける対象が実在する', () => {
        for (const scene of myth.scenes) {
          const focus = scene.focus;
          if (!focus) continue;
          if (focus.kind === 'star') {
            expect(catalogHrs.has(focus.hr), `HR ${focus.hr}`).toBe(true);
          } else if (focus.kind === 'stars') {
            expect(focus.hrs.length).toBeGreaterThan(0);
            for (const hr of focus.hrs) expect(catalogHrs.has(hr), `HR ${hr}`).toBe(true);
          } else {
            expect(ASTERISMS.some((a) => a.id === focus.id), focus.id).toBe(true);
          }
        }
      });

      it('典拠が記されている', () => {
        expect(myth.sources.length).toBeGreaterThan(0);
      });
    });
  }

  it('すべての物語がいずれかの星座から到達できる', () => {
    const reachable = new Set(ASTERISMS.map((a) => a.mythId));
    for (const myth of MYTHS) expect(reachable.has(myth.id), myth.id).toBe(true);
  });
});
