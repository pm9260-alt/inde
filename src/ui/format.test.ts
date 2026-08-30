import { describe, expect, it } from 'vitest';

import { altitudeName, compassName, moonPhaseName, skyPositionPhrase } from './format';

describe('方位の呼び名', () => {
  it('主要な方位が正しい', () => {
    expect(compassName(0)).toBe('北');
    expect(compassName(90)).toBe('東');
    expect(compassName(180)).toBe('南');
    expect(compassName(270)).toBe('西');
    expect(compassName(45)).toBe('北東');
  });

  it('360 度をまたいでも北に戻る', () => {
    expect(compassName(359)).toBe('北');
    expect(compassName(360)).toBe('北');
    expect(compassName(-10)).toBe('北');
  });

  it('境目で隣の方位に切り替わる', () => {
    expect(compassName(11)).toBe('北');
    expect(compassName(12)).toBe('北北東');
  });
});

describe('高度の呼び名', () => {
  it('高いほうから順に呼び分ける', () => {
    expect(altitudeName(80)).toBe('ほぼ真上');
    expect(altitudeName(50)).toBe('高い空');
    expect(altitudeName(30)).toBe('中ほどの空');
    expect(altitudeName(5)).toBe('低い空');
    expect(altitudeName(-5)).toBe('地平線の下');
  });
});

describe('空の位置の言い方', () => {
  it('方位と高度を組み合わせる', () => {
    expect(skyPositionPhrase(10, 180)).toBe('南の低い空');
    expect(skyPositionPhrase(50, 90)).toBe('東の高い空');
  });

  it('真上では方位を言わない', () => {
    expect(skyPositionPhrase(85, 123)).toBe('ほぼ真上');
  });

  it('地平線下ではその旨を言う', () => {
    expect(skyPositionPhrase(-20, 270)).toBe('西の地平線の下');
  });
});

describe('月の呼び名', () => {
  it('新月と満月を言い分ける', () => {
    expect(moonPhaseName(0.01)).toBe('新月');
    expect(moonPhaseName(0.99)).toBe('満月');
    expect(moonPhaseName(0.5)).toBe('半月');
  });

  it('その他は輝面比を添える', () => {
    expect(moonPhaseName(0.25)).toContain('25%');
    expect(moonPhaseName(0.8)).toContain('80%');
  });
});
