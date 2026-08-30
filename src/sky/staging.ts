/**
 * 星座が立ち上がるまでの演出。
 *
 * 「星が現れる → 対象の星が静かに強調される → 星座線が順に形成される →
 * 名前が控えめに現れる → 登場人物が出る → 物語が始まる」という一連の流れを、
 * 経過時間だけから決まる純粋な関数として表す。
 *
 * 本番とデモで演出を二重に持たないための要。どちらも同じこの関数を通る。
 * 違うのは「いつ始まったか」と「空をどこから持ってくるか」だけで、
 * 見え方を決めるコードはここ一箇所にしかない。
 *
 * React にも GL にも依存しないので、動きの設計をそのまま検証できる。
 */
import type { Asterism } from '../data/constellations';
import { staging as timing } from '../design/tokens';

/** 演出の起点。null は「まだ始まっていない」。すべて Date.now() の値。 */
export interface StagingClock {
  /** 空そのものが現れ始めた時刻。デモでのみ使う。 */
  readonly skyFadeStartedAt: number | null;
  /** 星座を見つけた時刻。星の強調と線の形成がここから始まる。 */
  readonly revealStartedAt: number | null;
  /** 物語を開いた時刻。登場人物の出現とシートの上昇がここから始まる。 */
  readonly entranceStartedAt: number | null;
}

export const IDLE_CLOCK: StagingClock = {
  skyFadeStartedAt: null,
  revealStartedAt: null,
  entranceStartedAt: null,
};

export interface StagingState {
  /** 空全体の不透明度。デモの入りでのみ 1 未満になる。 */
  readonly skyOpacity: number;
  /** 星ごとの強調の強さ（0〜1）。HR 番号で引く。 */
  readonly starEmphasis: ReadonlyMap<number, number>;
  /** 星座線ごとの伸び具合（0〜1）。asterism.lines と同じ並び。 */
  readonly lineProgress: readonly number[];
  /** 名前の見えかた（0〜1）。 */
  readonly labelOpacity: number;
  /** 登場人物の見えかた（0〜1）と大きさ。 */
  readonly figureOpacity: number;
  readonly figureScale: number;
  /** 神話のシートを上げてよいか。 */
  readonly mythReady: boolean;
  /** 名前を出すところまで終わったか。 */
  readonly revealComplete: boolean;
}

export const IDLE_STATE: StagingState = {
  skyOpacity: 1,
  starEmphasis: new Map(),
  lineProgress: [],
  labelOpacity: 0,
  figureOpacity: 0,
  figureScale: 1,
  mythReady: false,
  revealComplete: false,
};

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * 減速のみのイージング。加速から入る動きは、夜空では落ち着かない。
 * 3 次で入ると強すぎるので 2 次と 3 次の中間あたりを使う。
 */
const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 2.6;

/** 線が伸びるときの速さ。描き始めが速く、止まりぎわで静かに落ちる。 */
const easeOutLine = (t: number): number => 1 - (1 - clamp01(t)) ** 2.2;

/**
 * 星の強調。立ち上がってから、少しだけ戻る。
 * 上げたままだと「選択されている」に見え、「気づいた」には見えない。
 */
const emphasisAt = (elapsed: number): number => {
  if (elapsed <= 0) return 0;
  if (elapsed < timing.starRise) return easeOut(elapsed / timing.starRise);
  const relaxing = clamp01((elapsed - timing.starRise) / timing.starRelax);
  return 1 - (1 - timing.starRelaxTo) * easeOut(relaxing);
};

/**
 * 星が強調される順。データで決める。指定されていない星は、
 * 星座線に現れる順に後ろへ足す。
 */
export const revealSequence = (asterism: Asterism): readonly number[] => {
  const ordered: number[] = [...(asterism.revealOrder ?? [])];
  const seen = new Set(ordered);
  for (const [a, b] of asterism.lines) {
    for (const hr of [a, b]) {
      if (!seen.has(hr)) {
        seen.add(hr);
        ordered.push(hr);
      }
    }
  }
  for (const hr of asterism.extraStars ?? []) {
    if (!seen.has(hr)) {
      seen.add(hr);
      ordered.push(hr);
    }
  }
  return ordered;
};

/**
 * 名前が出はじめる時刻（演出の起点から）。
 * 画面側は星座名を React で出すので、同じ時計を共有するためにここから配る。
 */
export const labelStartOffset = (asterism: Asterism, withSkyFade: boolean): number => {
  const skyHold = withSkyFade ? timing.skyFadeIn + timing.skySettle : 0;
  const lastLineEnd =
    timing.lineDelay + (asterism.lines.length - 1) * timing.lineStagger + timing.lineDraw;
  return skyHold + lastLineEnd + timing.labelDelay;
};

/** 物語のシートを上げてよい時刻（物語を開いてから）。 */
export const mythSheetOffset = (): number => timing.figureDelay + timing.mythDelay;

/** 名前が出るまでにかかる時間。演出全体の長さの目安に使う。 */
export const revealDuration = (asterism: Asterism): number => {
  const lastLineEnd =
    timing.lineDelay +
    (asterism.lines.length - 1) * timing.lineStagger +
    timing.lineDraw;
  const lastStarEnd =
    (revealSequence(asterism).length - 1) * timing.starStagger + timing.starRise;
  return Math.max(lastLineEnd, lastStarEnd) + timing.labelDelay + timing.labelFade;
};

/**
 * いまの見え方を求める。毎フレーム呼ばれる前提で、確保するものは
 * 呼び出し側から渡してもらう。
 *
 * @param scratch 使い回す Map と配列。毎フレームの確保を避ける。
 */
export const evaluateStaging = (
  asterism: Asterism | null,
  clock: StagingClock,
  now: number,
  scratch: { emphasis: Map<number, number>; progress: number[] },
): StagingState => {
  const skyOpacity =
    clock.skyFadeStartedAt == null
      ? 1
      : easeOut((now - clock.skyFadeStartedAt) / timing.skyFadeIn);

  if (!asterism || clock.revealStartedAt == null) {
    scratch.emphasis.clear();
    scratch.progress.length = 0;
    return { ...IDLE_STATE, skyOpacity, starEmphasis: scratch.emphasis, lineProgress: scratch.progress };
  }

  // デモでは空が出そろい、少し置いてから強調が始まる。
  const skyHold =
    clock.skyFadeStartedAt == null ? 0 : timing.skyFadeIn + timing.skySettle;
  const elapsed = now - clock.revealStartedAt - skyHold;

  scratch.emphasis.clear();
  const order = revealSequence(asterism);
  for (let i = 0; i < order.length; i += 1) {
    const value = emphasisAt(elapsed - i * timing.starStagger);
    if (value > 0) scratch.emphasis.set(order[i], value);
  }

  scratch.progress.length = asterism.lines.length;
  for (let i = 0; i < asterism.lines.length; i += 1) {
    const start = timing.lineDelay + i * timing.lineStagger;
    scratch.progress[i] = easeOutLine((elapsed - start) / timing.lineDraw);
  }

  const lastLineEnd =
    timing.lineDelay + (asterism.lines.length - 1) * timing.lineStagger + timing.lineDraw;
  const labelStart = lastLineEnd + timing.labelDelay;
  const labelOpacity = easeOut((elapsed - labelStart) / timing.labelFade);

  const entranceElapsed =
    clock.entranceStartedAt == null ? -1 : now - clock.entranceStartedAt;
  const figureProgress =
    entranceElapsed < 0
      ? 0
      : easeOut((entranceElapsed - timing.figureDelay) / timing.figureFade);

  return {
    skyOpacity,
    starEmphasis: scratch.emphasis,
    lineProgress: scratch.progress,
    labelOpacity,
    figureOpacity: figureProgress,
    figureScale: timing.figureScaleFrom + (1 - timing.figureScaleFrom) * figureProgress,
    mythReady: entranceElapsed >= timing.figureDelay + timing.mythDelay,
    revealComplete: elapsed >= labelStart + timing.labelFade,
  };
};

/** 使い回し用の入れ物を作る。 */
export const createStagingScratch = (): {
  emphasis: Map<number, number>;
  progress: number[];
} => ({ emphasis: new Map(), progress: [] });
