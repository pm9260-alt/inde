/**
 * 演出の検証。
 *
 * 動きの善し悪しは目でしか判断できないが、「順序が守られているか」
 * 「途中で戻ったり飛んだりしないか」「必ず終わるか」は数値で押さえられる。
 * ここが崩れると、本番とデモの両方が同時に壊れる。
 */
import { describe, expect, it } from 'vitest';

import { asterismById, asterismStarHrs } from '../data/constellations';
import { staging as timing } from '../design/tokens';
import {
  createStagingScratch,
  evaluateStaging,
  IDLE_CLOCK,
  revealDuration,
  revealSequence,
  type StagingClock,
} from './staging';

const orion = asterismById('orion');
const scratch = createStagingScratch();

const at = (clock: StagingClock, now: number) => evaluateStaging(orion, clock, now, scratch);

/** 起点を 0 とする、空のフェードなしの時計。本番と同じ条件。 */
const liveClock: StagingClock = {
  skyFadeStartedAt: null,
  revealStartedAt: 0,
  entranceStartedAt: null,
};

describe('星が灯る順', () => {
  it('データで指定した順が先頭に来る', () => {
    const order = revealSequence(orion);
    expect(order.slice(0, 3)).toEqual([1852, 1903, 1948]); // 三つ星
    expect(order[3]).toBe(2061); // ベテルギウス
  });

  it('星座のすべての星がちょうど一度ずつ現れる', () => {
    for (const asterism of [
      'orion',
      'big-dipper',
      'cassiopeia',
      'scorpius',
      'summer-triangle',
    ].map(asterismById)) {
      const order = revealSequence(asterism);
      expect(new Set(order).size).toBe(order.length);
      expect([...order].sort()).toEqual([...asterismStarHrs(asterism)].sort());
    }
  });
});

describe('星の強調', () => {
  it('順番に立ち上がる', () => {
    const order = revealSequence(orion);
    // 2 番目の星が立ち上がり始めたころ、1 番目はすでに進んでいる。
    const state = at(liveClock, timing.starStagger + 40);
    expect(state.starEmphasis.get(order[0]) ?? 0).toBeGreaterThan(
      state.starEmphasis.get(order[1]) ?? 0,
    );
  });

  it('立ち上がりきったあと、少しだけ戻る', () => {
    const first = revealSequence(orion)[0];
    const peak = at(liveClock, timing.starRise).starEmphasis.get(first) ?? 0;
    const settled =
      at(liveClock, timing.starRise + timing.starRelax + 100).starEmphasis.get(first) ?? 0;
    expect(peak).toBeCloseTo(1, 2);
    expect(settled).toBeLessThan(peak);
    expect(settled).toBeCloseTo(timing.starRelaxTo, 2);
  });

  it('0 と 1 の外へ出ない', () => {
    for (let t = 0; t <= 8000; t += 50) {
      for (const value of at(liveClock, t).starEmphasis.values()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('始まる前は誰も光っていない', () => {
    expect(at(liveClock, -10).starEmphasis.size).toBe(0);
  });
});

describe('星座線の形成', () => {
  it('データに書かれた順に引かれる', () => {
    const state = at(liveClock, timing.lineDelay + timing.lineStagger + 40);
    expect(state.lineProgress[0]).toBeGreaterThan(state.lineProgress[1]);
    expect(state.lineProgress[1]).toBeGreaterThan(state.lineProgress[2]);
  });

  it('星の強調より遅れて始まる', () => {
    const state = at(liveClock, timing.lineDelay - 20);
    expect(Math.max(...state.lineProgress)).toBe(0);
    expect(state.starEmphasis.size).toBeGreaterThan(0);
  });

  it('どの線も単調に伸びる（途中で戻らない）', () => {
    const previous = orion.lines.map(() => 0);
    for (let t = 0; t <= 8000; t += 25) {
      const state = at(liveClock, t);
      state.lineProgress.forEach((value, i) => {
        expect(value).toBeGreaterThanOrEqual(previous[i] - 1e-9);
        expect(value).toBeLessThanOrEqual(1);
        previous[i] = value;
      });
    }
    expect(Math.min(...previous)).toBe(1);
  });

  it('最後の線が引き終わるまで名前は出ない', () => {
    const lastLineEnd =
      timing.lineDelay + (orion.lines.length - 1) * timing.lineStagger + timing.lineDraw;
    expect(at(liveClock, lastLineEnd).labelOpacity).toBe(0);
    expect(at(liveClock, lastLineEnd + timing.labelDelay + 10).labelOpacity).toBeGreaterThan(0);
  });
});

describe('全体の長さ', () => {
  it('名前が出そろったところで完了になる', () => {
    const total = revealDuration(orion);
    expect(at(liveClock, total - 50).revealComplete).toBe(false);
    expect(at(liveClock, total + 10).revealComplete).toBe(true);
    expect(at(liveClock, total + 10).labelOpacity).toBeCloseTo(1, 2);
  });

  it('立ち止まって見ていられる長さに収まっている', () => {
    // 長すぎると人が待てず、短すぎると演出に見えない。
    for (const id of ['orion', 'scorpius', 'summer-triangle']) {
      const total = revealDuration(asterismById(id));
      expect(total).toBeGreaterThan(1500);
      expect(total).toBeLessThan(6000);
    }
  });
});

describe('デモでの空の出現', () => {
  const demoClock: StagingClock = {
    skyFadeStartedAt: 0,
    revealStartedAt: 0,
    entranceStartedAt: null,
  };

  it('空が現れきってから、間をおいて星の強調が始まる', () => {
    expect(at(demoClock, 0).skyOpacity).toBe(0);
    expect(at(demoClock, timing.skyFadeIn).skyOpacity).toBeCloseTo(1, 2);
    // 空が出ている途中は、まだ誰も強調されない。
    expect(at(demoClock, timing.skyFadeIn).starEmphasis.size).toBe(0);
    expect(at(demoClock, timing.skyFadeIn + timing.skySettle - 10).starEmphasis.size).toBe(0);
    expect(
      at(demoClock, timing.skyFadeIn + timing.skySettle + 60).starEmphasis.size,
    ).toBeGreaterThan(0);
  });

  it('空の出現ぶんだけ全体が後ろへずれる', () => {
    const shift = timing.skyFadeIn + timing.skySettle;
    const live = at(liveClock, 2000);
    const demo = at(demoClock, 2000 + shift);
    expect(demo.lineProgress).toEqual(live.lineProgress);
  });

  it('本番では空は最初から見えている', () => {
    expect(at(liveClock, 0).skyOpacity).toBe(1);
  });
});

describe('登場人物と神話', () => {
  it('物語を開くまで登場人物は出ない', () => {
    expect(at(liveClock, 10_000).figureOpacity).toBe(0);
    expect(at(liveClock, 10_000).mythReady).toBe(false);
  });

  it('物語を開くと、登場人物が出てからシートが上がる', () => {
    const clock: StagingClock = { ...liveClock, entranceStartedAt: 5000 };
    expect(evaluateStaging(orion, clock, 5000, scratch).figureOpacity).toBe(0);
    const mid = evaluateStaging(orion, clock, 5000 + timing.figureDelay + 300, scratch);
    expect(mid.figureOpacity).toBeGreaterThan(0);
    expect(mid.figureScale).toBeGreaterThan(timing.figureScaleFrom);
    expect(mid.figureScale).toBeLessThan(1);

    const later = evaluateStaging(
      orion,
      clock,
      5000 + timing.figureDelay + timing.figureFade + 50,
      scratch,
    );
    expect(later.figureOpacity).toBeCloseTo(1, 2);
    expect(later.figureScale).toBeCloseTo(1, 2);
    expect(later.mythReady).toBe(true);
  });

  it('登場人物の出現が始まる前にシートは上がらない', () => {
    const clock: StagingClock = { ...liveClock, entranceStartedAt: 5000 };
    expect(evaluateStaging(orion, clock, 5000 + timing.figureDelay, scratch).mythReady).toBe(
      false,
    );
  });
});

describe('何もしていないとき', () => {
  it('星座が無ければ何も起きない', () => {
    const state = evaluateStaging(null, IDLE_CLOCK, 1000, scratch);
    expect(state.starEmphasis.size).toBe(0);
    expect(state.lineProgress).toHaveLength(0);
    expect(state.labelOpacity).toBe(0);
    expect(state.skyOpacity).toBe(1);
  });

  it('起点が無ければ演出は進まない', () => {
    const state = evaluateStaging(orion, IDLE_CLOCK, 99_999, scratch);
    expect(state.starEmphasis.size).toBe(0);
    expect(state.labelOpacity).toBe(0);
  });
});
