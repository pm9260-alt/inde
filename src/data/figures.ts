/**
 * 星座に現れる登場人物・怪物。
 *
 * まだ 3D モデルはありません。ここにあるのは「どこに、どれくらいの大きさで、
 * どの向きで置くか」という決めごとだけです。モデルが用意できたら
 * `model` に GLB を差すだけで、置き場所も間合いも変えずに実物へ入れ替わります。
 *
 * 置き方の考え方
 * ---------------------------------------------------------------------------
 * 星座の中の 2 つの星を「基準線」として選び、その長さを物差しにします。
 * オリオン座なら三つ星。三つ星の長さの何倍が身の丈か、中点からどれだけ
 * 上にずらすか、という比で決めます。
 *
 * 見かけの大きさを角度で直接書かないのは、星座の見かけの大きさが観測地や
 * 時刻で変わらない（＝星どうしの角距離は不変）ため、星を物差しにしたほうが
 * 空のどこにあっても破綻しないからです。
 */

/** GLB 内のアニメーション。 */
export interface FigureMotion {
  readonly id: string;
  /** GLB のアニメーションクリップ名。 */
  readonly clip: string;
  readonly loop: boolean;
  /** 再生の速さ。1 が等倍。 */
  readonly speed: number;
}

export interface FigureModel {
  /**
   * `require('../../assets/figures/xxx.glb')` の戻り値。
   * まだ用意できていないものは null。null のあいだは枠だけが表示され、
   * 出現の間合いと大きさを確かめられます。
   */
  readonly source: number | null;
  /** モデル座標系での身の丈。基準線に合わせるときの換算に使う。 */
  readonly nominalHeight: number;
}

export interface FigurePlacement {
  /** 物差しにする 2 つの星（HR 番号）。 */
  readonly baseFromHr: number;
  readonly baseToHr: number;
  /** 基準線の長さに対する身の丈の倍率。 */
  readonly heightRatio: number;
  /** 基準線の中点から天頂側へずらす量。基準線の長さに対する比。 */
  readonly liftRatio: number;
  /** 身の丈に対する幅の比。枠の形を決める。 */
  readonly widthRatio: number;
}

export interface Figure {
  readonly id: string;
  readonly nameJa: string;
  readonly placement: FigurePlacement;
  readonly model: FigureModel | null;
  readonly motions: readonly FigureMotion[];
}

export const FIGURES: readonly Figure[] = [
  {
    id: 'orion-hunter',
    nameJa: '狩人オリオン',
    placement: {
      // 三つ星を物差しにする。長さ約 2.7°。
      baseFromHr: 1852,
      baseToHr: 1948,
      // 頭のメイサから足のリゲルまでが約 18°。三つ星の 6.7 倍。
      heightRatio: 6.7,
      // 三つ星は腰の位置なので、身体の中心はその少し上。
      liftRatio: 0.3,
      widthRatio: 0.46,
    },
    model: null,
    motions: [
      { id: 'idle', clip: 'Idle', loop: true, speed: 1 },
      { id: 'draw-bow', clip: 'DrawBow', loop: false, speed: 1 },
    ],
  },
  {
    id: 'scorpion',
    nameJa: '蠍',
    placement: {
      // 心臓のアンタレスから毒針のシャウラまで。
      baseFromHr: 6134,
      baseToHr: 6527,
      heightRatio: 1.1,
      liftRatio: 0,
      widthRatio: 1.4,
    },
    model: null,
    motions: [{ id: 'idle', clip: 'Idle', loop: true, speed: 1 }],
  },
  {
    id: 'cassiopeia-queen',
    nameJa: '王妃カシオペヤ',
    placement: {
      baseFromHr: 168,
      baseToHr: 403,
      heightRatio: 1.6,
      liftRatio: 0.15,
      widthRatio: 0.7,
    },
    model: null,
    motions: [{ id: 'idle', clip: 'Idle', loop: true, speed: 1 }],
  },
  {
    id: 'northern-dipper',
    nameJa: '天の車',
    placement: {
      baseFromHr: 4301,
      baseToHr: 5191,
      heightRatio: 0.7,
      liftRatio: 0.1,
      widthRatio: 1.6,
    },
    model: null,
    motions: [{ id: 'idle', clip: 'Idle', loop: true, speed: 1 }],
  },
  {
    id: 'weaver',
    nameJa: '織姫',
    placement: {
      // ベガとアルタイル。天の川をはさむ 2 星。
      baseFromHr: 7001,
      baseToHr: 7557,
      heightRatio: 0.5,
      liftRatio: 0.05,
      widthRatio: 0.5,
    },
    model: null,
    motions: [{ id: 'idle', clip: 'Idle', loop: true, speed: 1 }],
  },
];

export const figureById = (id: string): Figure | null =>
  FIGURES.find((figure) => figure.id === id) ?? null;

/** 実物の 3D モデルが用意されているか。無ければ枠だけを描く。 */
export const hasModel = (figure: Figure): boolean => figure.model?.source != null;
