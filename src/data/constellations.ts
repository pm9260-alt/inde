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
  /**
   * 星座線。HR 番号の対で表す。
   * **並び順が演出の順序になる。** 図として自然に描き進む順に並べること。
   * 途中で離れた場所へ飛ぶと、線が引かれていく様子が不自然になる。
   */
  readonly lines: readonly (readonly [number, number])[];
  /**
   * 星が灯る順。演出の入り口をどの星にするかは、その星座の見つけ方に直結する。
   * ここに無い星は、星座線に現れる順で後ろに続く。
   */
  readonly revealOrder?: readonly number[];
  /**
   * 星座線ができたあとに現れる登場人物。src/data/figures.ts の ID。
   * 3D モデルがまだ無くても、置き場所と間合いはこの指定だけで決まる。
   */
  readonly figureId?: string;
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
    // 三つ星から描き始め、そこから外へ広げていく。実際に人が
    // オリオン座を見つけるときの順序と同じ。
    lines: [
      // 三つ星
      [1852, 1903],
      [1903, 1948],
      // 帯から胴の両側へ
      [1790, 1852],
      [2061, 1948],
      // 両肩
      [2061, 1790],
      // 足へ
      [1852, 1713],
      [1948, 2004],
      [1713, 2004],
      // 頭
      [1879, 1790],
      [1879, 2061],
    ],
    // 三つ星が先。次に色の対比が際立つベテルギウスとリゲル。頭は最後。
    revealOrder: [1852, 1903, 1948, 2061, 1713, 1790, 2004, 1879],
    figureId: 'orion-hunter',
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
    // ますの先端から柄の先へ。北極星を指す 2 星から始める。
    revealOrder: [4301, 4295, 4554, 4660, 4905, 5054, 5191, 5062],
    figureId: 'northern-dipper',
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
    // W の字をなぞる順。
    revealOrder: [21, 168, 264, 403, 542],
    figureId: 'cassiopeia-queen',
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
    // 心臓のアンタレスが先。そこから頭へ戻り、尾へ抜ける。
    revealOrder: [
      6134, 5953, 5984, 5944, 6084, 6165, 6241, 6247, 6271, 6380, 6553, 6615, 6580, 6527, 6508,
    ],
    figureId: 'scorpion',
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
    // 明るい順。ベガ、アルタイル、デネブ。
    revealOrder: [7001, 7557, 7924],
    figureId: 'weaver',
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
