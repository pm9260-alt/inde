/**
 * 星の描画。
 *
 * 位置・色・明るさは 20 秒に一度しか変わらないので、頂点バッファは
 * その周期でだけ作り直す。毎フレーム GPU へ送るのは行列ひとつだけ。
 *
 * 見た目
 * ---------------------------------------------------------------------------
 * 星は点ではなく、中心の芯とそのまわりの淡いにじみでできている。実際の
 * 肉眼でも、明るい星ほど「大きく」感じるのは網膜と眼球の散乱によるもので、
 * 角直径が大きいわけではない。等級から直径と明るさの両方を動かすことで、
 * その感じ方を再現する。
 * 色は彩度を大きく落とす。実際の夜空で色がわかるのはベテルギウスや
 * アンタレスのような一部だけで、全部が色づいていると嘘になる。
 */
import type { Vec3 } from '../../astro/math';
import { starStyle } from '../../design/tokens';
import { STAR_CATALOG } from '../../data/stars.generated';
import { ALL_MEMBER_HRS } from '../../data/constellations';
import { createProgram, type GL } from './program';
import type { Mat4 } from '../matrix';

const VERTEX_SOURCE = `
attribute vec3 aDirection;
attribute vec3 aColor;
attribute float aSize;
attribute float aBrightness;

uniform mat4 uViewProjection;
uniform float uPixelRatio;
uniform float uGlobalOpacity;

varying vec3 vColor;
varying float vBrightness;

void main() {
  gl_Position = uViewProjection * vec4(aDirection, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  vColor = aColor;
  vBrightness = aBrightness * uGlobalOpacity;
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;

varying vec3 vColor;
varying float vBrightness;

void main() {
  // 点スプライトの中心からの距離（中心 0、縁 1）。
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;

  // にじみ。ガウス状に外へ向かって落ちる。
  float halo = exp(-5.0 * d * d);
  // 芯。中心のごく狭い範囲だけを白く飽和させる。
  float core = smoothstep(0.42, 0.0, d);

  float intensity = (halo * 0.55 + core * 0.75) * vBrightness;
  // 芯に近いほど白へ寄せる。明るい星の中心が色づいて見えるのは不自然。
  vec3 tint = mix(vColor, vec3(1.0), core * 0.7);

  gl_FragColor = vec4(tint * intensity, intensity);
}
`;

/** 等級から見かけの直径（論理ピクセル）。 */
export const sizeForMagnitude = (magnitude: number): number => {
  const steps = magnitude - starStyle.referenceMagnitude;
  const size = starStyle.referenceSizePx * starStyle.sizeFalloffPerMagnitude ** steps;
  return Math.min(starStyle.maxSizePx, Math.max(starStyle.minSizePx, size));
};

/** 星の色を、彩度を落としてから返す。 */
const desaturate = (color: readonly [number, number, number]): [number, number, number] => {
  const s = starStyle.saturation;
  return [
    1 + (color[0] - 1) * s,
    1 + (color[1] - 1) * s,
    1 + (color[2] - 1) * s,
  ];
};

/** setPoints に渡す 1 点。 */
export interface StarPoint {
  readonly direction: Vec3;
  readonly color: readonly [number, number, number];
  /** 見かけの直径（論理ピクセル）。 */
  readonly size: number;
  /** 明るさ（0〜1）。 */
  readonly brightness: number;
}

export interface StarLayerFrame {
  readonly viewProjection: Mat4;
  readonly pixelRatio: number;
  /** 全体の不透明度。神話を読んでいるあいだ星空を沈めるのに使う。 */
  readonly opacity: number;
}

export class StarLayer {
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly attributes: { direction: number; color: number; size: number; brightness: number };
  private readonly uniforms: {
    viewProjection: WebGLUniformLocation | null;
    pixelRatio: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
  };

  /** 1 頂点あたりの float 数: 方向 3 + 色 3 + 大きさ 1 + 明るさ 1 */
  private static readonly STRIDE = 8;

  private readonly vertexData = new Float32Array(STAR_CATALOG.length * StarLayer.STRIDE);
  private vertexCount = 0;

  constructor(private readonly gl: GL) {
    this.program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('頂点バッファを作成できませんでした');
    this.buffer = buffer;
    this.attributes = {
      direction: gl.getAttribLocation(this.program, 'aDirection'),
      color: gl.getAttribLocation(this.program, 'aColor'),
      size: gl.getAttribLocation(this.program, 'aSize'),
      brightness: gl.getAttribLocation(this.program, 'aBrightness'),
    };
    this.uniforms = {
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      pixelRatio: gl.getUniformLocation(this.program, 'uPixelRatio'),
      opacity: gl.getUniformLocation(this.program, 'uGlobalOpacity'),
    };
  }

  /**
   * 描く星を差し替える。
   *
   * @param directions 星表と同じ並びの ENU 単位ベクトル
   * @param altitudes  星表と同じ並びの高度（度）
   * @param brightness 星ごとの見え方（0〜1）。0 の星は送らない。
   */
  setStars(
    directions: Float32Array,
    altitudes: Float32Array,
    brightness: Float32Array,
  ): void {
    const data = this.vertexData;
    let offset = 0;
    for (let i = 0; i < STAR_CATALOG.length; i += 1) {
      // 地平線の下にある星は描かない。地面を透かして星が見えることはない。
      if (altitudes[i] < -1) continue;
      const value = brightness[i];
      if (value <= 0.02) continue;

      const star = STAR_CATALOG[i];
      const tint = desaturate(star.color);
      const isMember = ALL_MEMBER_HRS.has(star.hr);

      data[offset] = directions[i * 3];
      data[offset + 1] = directions[i * 3 + 1];
      data[offset + 2] = directions[i * 3 + 2];
      data[offset + 3] = tint[0];
      data[offset + 4] = tint[1];
      data[offset + 5] = tint[2];
      data[offset + 6] = sizeForMagnitude(star.mag) * (isMember ? starStyle.memberBoost : 1);
      data[offset + 7] = value;
      offset += StarLayer.STRIDE;
    }
    this.vertexCount = offset / StarLayer.STRIDE;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, offset), gl.DYNAMIC_DRAW);
  }

  /**
   * 星表とは別に、指定した点だけを描く。
   *
   * 演出で強調される星や、物語がいま語っている星を、通常の星の上に
   * 重ねて描くために使う。数個から十数個しかないので、毎フレーム
   * 作り直しても負荷にならない。
   */
  setPoints(points: readonly StarPoint[]): void {
    const data = this.vertexData;
    let offset = 0;
    for (const point of points) {
      if (point.brightness <= 0.004) continue;
      if (offset + StarLayer.STRIDE > data.length) break;
      data[offset] = point.direction.x;
      data[offset + 1] = point.direction.y;
      data[offset + 2] = point.direction.z;
      data[offset + 3] = point.color[0];
      data[offset + 4] = point.color[1];
      data[offset + 5] = point.color[2];
      data[offset + 6] = point.size;
      data[offset + 7] = point.brightness;
      offset += StarLayer.STRIDE;
    }
    this.vertexCount = offset / StarLayer.STRIDE;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, offset), gl.DYNAMIC_DRAW);
  }

  draw(frame: StarLayerFrame): void {
    if (this.vertexCount === 0) return;
    const gl = this.gl;
    const stride = StarLayer.STRIDE * 4;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);

    gl.enableVertexAttribArray(this.attributes.direction);
    gl.vertexAttribPointer(this.attributes.direction, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.attributes.color);
    gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.attributes.size);
    gl.vertexAttribPointer(this.attributes.size, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(this.attributes.brightness);
    gl.vertexAttribPointer(this.attributes.brightness, 1, gl.FLOAT, false, stride, 28);

    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, frame.viewProjection);
    gl.uniform1f(this.uniforms.pixelRatio, frame.pixelRatio);
    gl.uniform1f(this.uniforms.opacity, frame.opacity);

    gl.drawArrays(gl.POINTS, 0, this.vertexCount);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
