/**
 * ビルドごとに切り替わる設定。
 *
 * デモモードは、人に見せるときと開発中に演出を見直すためのもので、
 * 実際の夜空を映していない。公開ビルドに残すと誤解を招くため、
 * 既定では開発ビルドにしか入らない。
 *
 * 有効にする条件
 *   ・開発中（__DEV__）は常に使える
 *   ・それ以外は EXPO_PUBLIC_ENABLE_DEMO=true のときだけ
 *
 * EXPO_PUBLIC_ で始まる環境変数はバンドル時に値が埋め込まれるので、
 * false のビルドでは条件が定数の偽になり、デモの入口は画面に出ない。
 * eas.json の production プロファイルで false を明示している。
 */

export const DEMO_MODE_AVAILABLE: boolean =
  __DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEMO === 'true';

/**
 * 3D モデルがまだ無い登場人物を、枠だけで表示するか。
 * 置き場所と出現の間合いを確かめるためのもの。公開ビルドでは出さない。
 */
export const SHOW_FIGURE_PLACEHOLDER: boolean = DEMO_MODE_AVAILABLE;
