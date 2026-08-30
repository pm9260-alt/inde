/** WebGL のプログラム構築まわりの小さな道具。 */
import type { ExpoWebGLRenderingContext } from 'expo-gl';

export type GL = ExpoWebGLRenderingContext;

const compileShader = (gl: GL, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('シェーダを作成できませんでした');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`シェーダのコンパイルに失敗しました: ${log ?? '不明'}`);
  }
  return shader;
};

export const createProgram = (gl: GL, vertexSource: string, fragmentSource: string): WebGLProgram => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('プログラムを作成できませんでした');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  // リンク後はシェーダ本体を保持する必要がない。
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`プログラムのリンクに失敗しました: ${log ?? '不明'}`);
  }
  return program;
};
