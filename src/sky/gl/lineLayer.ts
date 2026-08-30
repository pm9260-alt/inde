/**
 * 星座線の描画。
 *
 * ピンホール投影（＝心射図法）は大円を直線に写す。星どうしを結ぶ最短の
 * 弧はちょうど大円なので、投影後の 2 点をまっすぐ結べば、それが正しい
 * 星座線になる。曲線を近似する必要はない。
 *
 * ただし、片方の星が端末の背後にあると投影が破綻する。そこで、2 点を結ぶ
 * 弦を手前側で切ってから投影する。弦上の点は弧上のどこかと同じ方向を
 * 指すので、この切り方でも図は変わらない。
 *
 * WebGL の線幅は多くの実装で 1 ピクセルに固定されるため、線は画面座標で
 * 四角形に展開して描く。幅と縁のやわらかさを自分で決められる利点もある。
 */
import { rotateInverse, type Quat, type Vec3 } from '../../astro/math';
import type { CameraProjection, Viewport } from '../../astro/projection';
import { createProgram, type GL } from './program';

const VERTEX_SOURCE = `
attribute vec2 aScreen;
attribute float aSide;
attribute vec4 aColor;

uniform vec2 uViewport;

varying float vSide;
varying vec4 vColor;

void main() {
  // 画面座標（左上原点・ピクセル）をクリップ座標へ。
  vec2 clip = vec2(
    aScreen.x / uViewport.x * 2.0 - 1.0,
    1.0 - aScreen.y / uViewport.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  vSide = aSide;
  vColor = aColor;
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;

varying float vSide;
varying vec4 vColor;

void main() {
  // 縁を柔らかく落とす。細い線でも段差が出ないようにする。
  float edge = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
  gl_FragColor = vec4(vColor.rgb * vColor.a * edge, vColor.a * edge);
}
`;

export interface SkySegment {
  /** 端点の ENU 単位ベクトル。 */
  readonly from: Vec3;
  readonly to: Vec3;
  /** 線の色（0〜1 の RGB）。 */
  readonly color: readonly [number, number, number];
  readonly opacity: number;
  /** 線幅（論理ピクセル）。 */
  readonly width: number;
  /**
   * 線を端から描き進める割合（0〜1）。星座を選んだときに線が引かれる演出に使う。
   * 1 なら全体を描く。
   */
  readonly progress?: number;
}

/** 端末の手前側の切り取り面。ここより視線方向の成分が小さい点は描かない。 */
const NEAR_DEPTH = 0.02;

export class LineLayer {
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly attributes: { screen: number; side: number; color: number };
  private readonly viewportUniform: WebGLUniformLocation | null;

  /** 1 頂点あたり: 画面座標 2 + 側 1 + 色 4 */
  private static readonly STRIDE = 7;
  // 全星座の線（38 本）＋ 演出中の星座の重ね描き ＋ 登場人物の枠。
  private static readonly MAX_SEGMENTS = 128;

  private readonly vertexData = new Float32Array(
    LineLayer.MAX_SEGMENTS * 6 * LineLayer.STRIDE,
  );
  private vertexCount = 0;

  constructor(private readonly gl: GL) {
    this.program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('頂点バッファを作成できませんでした');
    this.buffer = buffer;
    this.attributes = {
      screen: gl.getAttribLocation(this.program, 'aScreen'),
      side: gl.getAttribLocation(this.program, 'aSide'),
      color: gl.getAttribLocation(this.program, 'aColor'),
    };
    this.viewportUniform = gl.getUniformLocation(this.program, 'uViewport');
  }

  /** 毎フレーム、いまの姿勢で線を組み立て直す。 */
  setSegments(
    segments: readonly SkySegment[],
    attitude: Quat,
    projection: CameraProjection,
    viewport: Viewport,
  ): void {
    const data = this.vertexData;
    let offset = 0;

    for (const segment of segments) {
      if (segment.opacity <= 0.004) continue;
      if (offset / (6 * LineLayer.STRIDE) >= LineLayer.MAX_SEGMENTS) break;

      const a = rotateInverse(attitude, segment.from);
      const b = rotateInverse(attitude, segment.to);
      const clipped = clipToNearPlane(a, b);
      if (!clipped) continue;

      const progress = segment.progress ?? 1;
      if (progress <= 0) continue;
      const end =
        progress >= 1
          ? clipped.b
          : {
              x: clipped.a.x + (clipped.b.x - clipped.a.x) * progress,
              y: clipped.a.y + (clipped.b.y - clipped.a.y) * progress,
              z: clipped.a.z + (clipped.b.z - clipped.a.z) * progress,
            };

      const p0 = projectDeviceVector(clipped.a, projection);
      const p1 = projectDeviceVector(end, projection);
      if (!p0 || !p1) continue;

      // 両端とも画面から大きく外れている線は組み立てない。
      const margin = 200;
      const outside =
        (p0.x < -margin && p1.x < -margin) ||
        (p0.x > viewport.width + margin && p1.x > viewport.width + margin) ||
        (p0.y < -margin && p1.y < -margin) ||
        (p0.y > viewport.height + margin && p1.y > viewport.height + margin);
      if (outside) continue;

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const lengthPx = Math.hypot(dx, dy);
      if (lengthPx < 0.5) continue;
      const half = segment.width / 2;
      const nx = (-dy / lengthPx) * half;
      const ny = (dx / lengthPx) * half;

      const [r, g, bl] = segment.color;
      const alpha = segment.opacity;

      // 2 枚の三角形。side は縁のやわらかさに使う。
      const corners: [number, number, number][] = [
        [p0.x - nx, p0.y - ny, -1],
        [p0.x + nx, p0.y + ny, 1],
        [p1.x - nx, p1.y - ny, -1],
        [p1.x - nx, p1.y - ny, -1],
        [p0.x + nx, p0.y + ny, 1],
        [p1.x + nx, p1.y + ny, 1],
      ];
      for (const [x, y, side] of corners) {
        data[offset] = x;
        data[offset + 1] = y;
        data[offset + 2] = side;
        data[offset + 3] = r;
        data[offset + 4] = g;
        data[offset + 5] = bl;
        data[offset + 6] = alpha;
        offset += LineLayer.STRIDE;
      }
    }

    this.vertexCount = offset / LineLayer.STRIDE;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, offset), gl.DYNAMIC_DRAW);
  }

  draw(viewport: Viewport): void {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    const stride = LineLayer.STRIDE * 4;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    gl.enableVertexAttribArray(this.attributes.screen);
    gl.vertexAttribPointer(this.attributes.screen, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.attributes.side);
    gl.vertexAttribPointer(this.attributes.side, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(this.attributes.color);
    gl.vertexAttribPointer(this.attributes.color, 4, gl.FLOAT, false, stride, 12);

    gl.uniform2f(this.viewportUniform, viewport.width, viewport.height);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

/**
 * 端末座標の 2 点を結ぶ弦を、手前の切り取り面で切る。
 * 両方とも背後にあれば null。
 */
const clipToNearPlane = (a: Vec3, b: Vec3): { a: Vec3; b: Vec3 } | null => {
  const depthA = -a.z;
  const depthB = -b.z;
  const visibleA = depthA > NEAR_DEPTH;
  const visibleB = depthB > NEAR_DEPTH;
  if (!visibleA && !visibleB) return null;
  if (visibleA && visibleB) return { a, b };

  // depth が NEAR_DEPTH になる位置を求める。depth は線形に変化する。
  const t = (depthA - NEAR_DEPTH) / (depthA - depthB);
  const boundary: Vec3 = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
  return visibleA ? { a, b: boundary } : { a: boundary, b };
};

/** すでに端末座標系にあるベクトルを画面座標へ。 */
const projectDeviceVector = (
  v: Vec3,
  projection: CameraProjection,
): { x: number; y: number } | null => {
  const depth = -v.z;
  if (depth <= NEAR_DEPTH * 0.5) return null;
  return {
    x: projection.centerX + (v.x / depth) * projection.focalX,
    y: projection.centerY - (v.y / depth) * projection.focalY,
  };
};
