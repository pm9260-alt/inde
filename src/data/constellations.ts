/**
 * MVP で扱う星座・星の並び。
 *
 * 星は HR 番号（Harvard Revised）で参照する。名前や表記の揺れに影響されず、
 * 星表を作り直しても対応が壊れないため。
 * 星座線の形は、日本の星座早見盤や Stellarium などで一般に使われている
 * 描き方に合わせている（星座線は IAU が定めているものではない）。
 */

export type AsterismKind = 'constellation' | 'asterism';

export interface Asterism {
  readonly id: string;
  readonly nameJa: string;
  /** ふりがな。小さく添える。 */
  readonly reading: string;
  /** 学名。表示は控えめに。 */
  readonly nameLatin: string;
  readonly kind: AsterismKind;
  /** 星座線。HR 番号の対で表す。 */
  readonly lines: readonly (readonly [number, number])[];
  /**
   * 星座線には含めないが、その星座の一部として扱う星。
   * 名前を出したり、神話の中で触れたりする。
   */
  readonly extraStars?: readonly number[];
  /** 名前ラベルを置く基準の星。ふつうは最も明るい星。 */
  readonly labelHr: number;
  /** 見つけやすい時期。ひとことで。 */
  readonly bestSeason: string;
  /** この星座に結び付いた物語の ID。 */
  readonly mythId: string;
}

export const ASTERISMS: readonly Asterism[] = [
  {
    id: 'orion',
    nameJa: 'オリオン座',
    reading: 'おりおんざ',
    nameLatin: 'Orion',
    kind: 'constellation',
    lines: [
      // 頭
      [1879, 2061],
      [1879, 1790],
      // 両肩
      [2061, 1790],
      // 胴の両側
      [1790, 1852],
      [2061, 1948],
      // 三つ星
      [1852, 1903],
      [1903, 1948],
      // 足へ
      [1852, 1713],
      [1948, 2004],
      [1713, 2004],
    ],
    labelHr: 2061,
    bestSeason: '冬',
    mythId: 'orion',
  },
  {
    id: 'big-dipper',
    nameJa: '北斗七星',
    reading: 'ほくとしちせい',
    nameLatin: 'Ursa Major',
    kind: 'asterism',
    lines: [
      // ます
      [4301, 4295],
      [4295, 4554],
      [4554, 4660],
      [4660, 4301],
      // え
      [4660, 4905],
      [4905, 5054],
      [5054, 5191],
    ],
    // アルコル。ミザールに寄り添う四等星。
    extraStars: [5062],
    labelHr: 4905,
    bestSeason: '春',
    mythId: 'big-dipper',
  },
  {
    id: 'cassiopeia',
    nameJa: 'カシオペヤ座',
    reading: 'かしおぺやざ',
    nameLatin: 'Cassiopeia',
    kind: 'constellation',
    lines: [
      [21, 168],
      [168, 264],
      [264, 403],
      [403, 542],
    ],
    labelHr: 168,
    bestSeason: '秋',
    mythId: 'cassiopeia',
  },
  {
    id: 'scorpius',
    nameJa: 'さそり座',
    reading: 'さそりざ',
    nameLatin: 'Scorpius',
    kind: 'constellation',
    lines: [
      // 頭と両はさみ
      [5984, 5953],
      [5953, 5944],
      // 体
      [5944, 6084],
      [6084, 6134],
      [6134, 6165],
      [6165, 6241],
      // 尾の曲がり
      [6241, 6247],
      [6247, 6271],
      [6271, 6380],
      [6380, 6553],
      [6553, 6615],
      [6615, 6580],
      [6580, 6527],
      // 毒針
      [6527, 6508],
    ],
    labelHr: 6134,
    bestSeason: '夏',
    mythId: 'scorpius',
  },
  {
    id: 'summer-triangle',
    nameJa: '夏の大三角',
    reading: 'なつのだいさんかく',
    nameLatin: 'Summer Triangle',
    kind: 'asterism',
    lines: [
      [7001, 7924],
      [7924, 7557],
      [7557, 7001],
    ],
    labelHr: 7001,
    bestSeason: '夏',
    mythId: 'tanabata',
  },
];

export const asterismById = (id: string): Asterism => {
  const found = ASTERISMS.find((a) => a.id === id);
  if (!found) throw new Error(`星座 ${id} は定義されていません`);
  return found;
};

/** その星座を構成するすべての星の HR 番号（重複なし）。 */
export const asterismStarHrs = (asterism: Asterism): readonly number[] => {
  const set = new Set<number>();
  for (const [a, b] of asterism.lines) {
    set.add(a);
    set.add(b);
  }
  for (const hr of asterism.extraStars ?? []) set.add(hr);
  return [...set];
};

/** 星座線に使われるすべての星（全星座ぶん）。描画で「主役の星」を判定するのに使う。 */
export const ALL_MEMBER_HRS: ReadonlySet<number> = new Set(
  ASTERISMS.flatMap((a) => asterismStarHrs(a)),
);
