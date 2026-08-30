/**
 * 神話コンテンツの型。
 *
 * MVP では文章が中心だが、将来の AR 演出（登場人物が現れる、別の星座へ
 * 視線を誘導する、短いアニメーションが挿入される）をそのまま載せられる
 * 構造にしてある。ひとつの物語は「場面」の列で、場面ごとに
 *   ・読ませる文
 *   ・空のどこを見せたいか（focus）
 *   ・そこに現れる存在（figure。今は識別子だけを持ち、描画はまだしない）
 * を持つ。
 */

/** その場面で視線を向けさせたい対象。 */
export type MythFocus =
  | { readonly kind: 'star'; readonly hr: number }
  | { readonly kind: 'stars'; readonly hrs: readonly number[] }
  | { readonly kind: 'asterism'; readonly id: string };

export interface MythScene {
  readonly id: string;
  /** 章題。無い場面もある。 */
  readonly heading?: string;
  /** 本文。1 場面あたり 2〜4 文。立ったまま読める長さに保つこと。 */
  readonly body: string;
  readonly focus?: MythFocus;
  /**
   * 将来この場面に登場させる人物・怪物・道具の識別子。
   * 現時点では描画に使わないが、脚本として先に決めておく。
   */
  readonly figure?: string;
}

export type MythTradition = 'greek' | 'chinese' | 'japanese';

export interface Myth {
  readonly id: string;
  readonly tradition: MythTradition;
  /** 「ギリシャ神話」など、出所を一言で示すラベル。 */
  readonly traditionLabel: string;
  readonly title: string;
  /** 扉に置く一行。物語全体の呼び水。 */
  readonly epigraph: string;
  readonly scenes: readonly MythScene[];
  /** 典拠。事実関係を後から追えるようにしておく。 */
  readonly sources: readonly string[];
}
