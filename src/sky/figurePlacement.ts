/**
 * 登場人物を空のどこに、どれだけの大きさで置くかを求める。
 *
 * 3D モデルが入ったときも、入っていないときの枠も、置き場所の計算は同じ
 * ここを通ります。モデルが差し替わっても構図は変わりません。
 */
import { cross, dot, normalize, scale, sub, vec, angleBetween, DEG, type Vec3 } from '../astro/math';
import type { Figure } from '../data/figures';

export interface FigureFrame {
  /** 登場人物の中心方向（ENU 単位ベクトル）。 */
  readonly center: Vec3;
  /** 枠の四隅。左下・右下・右上・左上の順。 */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** 見かけの身の丈（度）。 */
  readonly heightDeg: number;
}

/**
 * @param directionOf HR 番号から ENU 方向を引く関数
 * @param scaleFactor 出現の途中を表す倍率。1 で本来の大きさ。
 */
export const computeFigureFrame = (
  figure: Figure,
  directionOf: (hr: number) => Vec3,
  scaleFactor = 1,
): FigureFrame | null => {
  const { placement } = figure;
  const from = directionOf(placement.baseFromHr);
  const to = directionOf(placement.baseToHr);

  const baseDeg = angleBetween(from, to);
  if (!Number.isFinite(baseDeg) || baseDeg < 1e-4) return null;

  const midpoint = normalize(vec(from.x + to.x, from.y + to.y, from.z + to.z));
  if (!midpoint) return null;

  // 中心方向の接平面に「上」と「右」を作る。上は天頂側。
  const zenith = vec(0, 0, 1);
  const upCandidate = sub(zenith, scale(midpoint, dot(zenith, midpoint)));
  // 真上・真下を向いているときは接平面の上が定まらない。そのときは北を使う。
  const up =
    normalize(upCandidate) ??
    normalize(sub(vec(0, 1, 0), scale(midpoint, dot(vec(0, 1, 0), midpoint))));
  if (!up) return null;
  const right = cross(up, midpoint);

  const heightDeg = baseDeg * placement.heightRatio * scaleFactor;
  const halfHeight = Math.tan(((heightDeg / 2) * DEG));
  const halfWidth = Math.tan((((heightDeg * placement.widthRatio) / 2) * DEG));
  const lift = Math.tan(baseDeg * placement.liftRatio * DEG);

  const center = normalize(
    vec(
      midpoint.x + up.x * lift,
      midpoint.y + up.y * lift,
      midpoint.z + up.z * lift,
    ),
  );
  if (!center) return null;

  const corner = (dx: number, dy: number): Vec3 => {
    const point = normalize(
      vec(
        center.x + right.x * dx * halfWidth + up.x * dy * halfHeight,
        center.y + right.y * dx * halfWidth + up.y * dy * halfHeight,
        center.z + right.z * dx * halfWidth + up.z * dy * halfHeight,
      ),
    );
    // center が単位ベクトルで halfWidth/halfHeight は有限なので、
    // 合成ベクトルが 0 になることはない。
    return point ?? center;
  };

  return {
    center,
    corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    heightDeg,
  };
};

/** 枠を線分に開く。四隅を順に結んで閉じる。 */
export const frameEdges = (
  frame: FigureFrame,
): readonly { from: Vec3; to: Vec3 }[] => [
  { from: frame.corners[0], to: frame.corners[1] },
  { from: frame.corners[1], to: frame.corners[2] },
  { from: frame.corners[2], to: frame.corners[3] },
  { from: frame.corners[3], to: frame.corners[0] },
];
