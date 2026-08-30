/**
 * 星空の描画面。カメラ映像の上に重ねる。
 *
 * React の再描画とは切り離してある。姿勢も演出の進み具合も ref から毎フレーム
 * 読む。星空が 60fps で動いているあいだ、React は何もしない。
 *
 * 描く順（後のものが上に重なる）
 *   1. 星表の星     20 秒に一度しか変わらない静的なバッファ
 *   2. 星座線       毎フレーム、演出の進み具合に応じて組み立て直す
 *   3. 強調の星     演出で灯る星と、物語がいま語っている星
 *   4. 登場人物     3D モデルが入るまでは置き場所を示す枠
 *
 * 本番とデモで通る道は同じ。違うのは model の作られ方と、演出の起点だけ。
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { Quat, Vec3 } from '../astro/math';
import { makeProjection, type CameraProjection, type Viewport } from '../astro/projection';
import { directionAt, starIndexByHr } from '../astro/sky';
import { SHOW_FIGURE_PLACEHOLDER } from '../config/featureFlags';
import { asterismById } from '../data/constellations';
import { figureById, hasModel } from '../data/figures';
import { STAR_CATALOG } from '../data/stars.generated';
import { rgbFromHex } from '../design/color';
import { color, starStyle, stroke } from '../design/tokens';
import { computeFigureFrame, frameEdges } from './figurePlacement';
import { LineLayer, type SkySegment } from './gl/lineLayer';
import { sizeForMagnitude, StarLayer, type StarPoint } from './gl/starLayer';
import {
  identityMat4,
  multiplyMat4,
  perspectiveMatrix,
  viewMatrixFromAttitude,
} from './matrix';
import { createStagingScratch, evaluateStaging, type StagingClock } from './staging';
import type { SkyModel } from './useSkyModel';

const LINE_REST = rgbFromHex(color.sky.line);
const LINE_GUIDE = rgbFromHex(color.sky.guide);
const LINE_ACTIVE = rgbFromHex(color.ember.core);
const EMBER = rgbFromHex(color.ember.core);
const FIGURE_FRAME = rgbFromHex(color.ember.deep);

/** 演出していない星座線の濃さ。空を邪魔しない程度に抑える。 */
const OPACITY_IDLE = 0.3;
/** 演出中・演出後の星座線。 */
const OPACITY_ACTIVE = 0.9;

/** 強調された星をどれだけ大きくするか。控えめに。 */
const EMPHASIS_SIZE_GAIN = 0.5;
/** 強調の色を橙へどれだけ寄せるか。 */
const EMPHASIS_TINT = 0.45;
/** 強調の明るさの上限。上の星を白飛びさせない。 */
const EMPHASIS_ALPHA = 0.8;

export interface SkyCanvasHandles {
  /** 端末が向いている先の星座 ID。 */
  aimedId: string | null;
  /** 演出中の星座 ID と、その起点。 */
  stagedId: string | null;
  clock: StagingClock;
  /** 星空全体の不透明度。神話を読むあいだ沈めるのに使う。 */
  opacity: number;
  /** いま物語が語っている星。 */
  highlightHrs: ReadonlySet<number>;
}

interface Props {
  readonly model: SkyModel;
  readonly attitudeRef: React.RefObject<Quat>;
  /** 照準と演出の状態。毎フレーム読むので ref で渡す。 */
  readonly handlesRef: React.RefObject<SkyCanvasHandles>;
  readonly verticalFovDeg: number;
}

export const SkyCanvas = ({ model, attitudeRef, handlesRef, verticalFovDeg }: Props) => {
  const viewportRef = useRef<Viewport>({ width: 1, height: 1 });
  const projectionRef = useRef<CameraProjection>(
    makeProjection({ width: 1, height: 1 }, verticalFovDeg),
  );
  const modelRef = useRef(model);
  /** 星空データを送り直す必要があるか。 */
  const starsDirtyRef = useRef(true);
  /** 実行中の描画ループ。画面を離れるときに止める。 */
  const frameHandleRef = useRef(0);
  const disposeRef = useRef<(() => void) | null>(null);

  modelRef.current = model;
  useEffect(() => {
    starsDirtyRef.current = true;
  }, [model]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      viewportRef.current = { width, height };
      projectionRef.current = makeProjection({ width, height }, verticalFovDeg);
    },
    [verticalFovDeg],
  );

  useEffect(() => {
    projectionRef.current = makeProjection(viewportRef.current, verticalFovDeg);
  }, [verticalFovDeg]);

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      const starLayer = new StarLayer(gl);
      const emphasisLayer = new StarLayer(gl);
      const lineLayer = new LineLayer(gl);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      // 色にはあらかじめ不透明度を掛けてある（乗算済みアルファ）。
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      const viewMatrix = identityMat4();
      const projectionMatrix = identityMat4();
      const viewProjection = identityMat4();
      const segmentBuffer: SkySegment[] = [];
      const pointBuffer: StarPoint[] = [];
      const scratch = createStagingScratch();

      const render = () => {
        frameHandleRef.current = requestAnimationFrame(render);

        const viewport = viewportRef.current;
        const projection = projectionRef.current;
        const attitude = attitudeRef.current;
        const handles = handlesRef.current;
        const currentModel = modelRef.current;
        const pixelRatio = viewport.width > 0 ? gl.drawingBufferWidth / viewport.width : 1;
        const now = Date.now();

        const staged = handles.stagedId ? asterismById(handles.stagedId) : null;
        const state = evaluateStaging(staged, handles.clock, now, scratch);
        const opacity = handles.opacity * state.skyOpacity;

        if (starsDirtyRef.current) {
          starLayer.setStars(
            currentModel.snapshot.directions,
            currentModel.snapshot.altitudes,
            currentModel.brightness,
          );
          starsDirtyRef.current = false;
        }

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clear(gl.COLOR_BUFFER_BIT);

        viewMatrixFromAttitude(attitude, viewMatrix);
        perspectiveMatrix(
          projection.verticalFovDeg,
          viewport.width / viewport.height,
          projectionMatrix,
        );
        multiplyMat4(projectionMatrix, viewMatrix, viewProjection);

        starLayer.draw({ viewProjection, pixelRatio, opacity });

        // --- 星座線 ---------------------------------------------------------
        segmentBuffer.length = 0;
        for (const segment of currentModel.segments) {
          const isStaged = segment.asterismId === handles.stagedId;
          const isAimed = segment.asterismId === handles.aimedId;

          if (!isStaged) {
            segmentBuffer.push({
              from: segment.from,
              to: segment.to,
              color: isAimed ? LINE_REST : LINE_GUIDE,
              opacity: OPACITY_IDLE * opacity,
              width: stroke.line,
            });
            continue;
          }

          // 演出中の線は 2 本重ねる。
          //   ・下地: これから引かれる道筋。薄いまま最後まで残す。
          //   ・本線: 端から伸びていく明るい線。
          // こうすると、線が消えてから引き直されるのではなく、
          // すでにそこにあったものが灯っていくように見える。
          const progress = state.lineProgress[segment.indexInAsterism] ?? 0;
          segmentBuffer.push({
            from: segment.from,
            to: segment.to,
            color: LINE_REST,
            opacity: OPACITY_IDLE * (1 - 0.4 * progress) * opacity,
            width: stroke.line,
          });
          if (progress <= 0) continue;
          segmentBuffer.push({
            from: segment.from,
            to: segment.to,
            color: LINE_ACTIVE,
            // 引かれ始めの先端が硬い点に見えないよう、序盤は薄く入る。
            opacity: OPACITY_ACTIVE * Math.min(1, progress / 0.35) * opacity,
            width: stroke.lineActive,
            progress,
          });
        }

        // --- 登場人物の枠 ---------------------------------------------------
        if (staged && state.figureOpacity > 0.004 && SHOW_FIGURE_PLACEHOLDER) {
          const figure = staged.figureId ? figureById(staged.figureId) : null;
          // 実物の 3D モデルが入ったら、枠ではなくそちらを描く。
          if (figure && !hasModel(figure)) {
            const frame = computeFigureFrame(
              figure,
              (hr) => directionAt(currentModel.snapshot, starIndexByHr(hr)),
              state.figureScale,
            );
            if (frame) {
              for (const edge of frameEdges(frame)) {
                segmentBuffer.push({
                  from: edge.from,
                  to: edge.to,
                  color: FIGURE_FRAME,
                  opacity: state.figureOpacity * 0.55 * opacity,
                  width: stroke.line,
                });
              }
            }
          }
        }

        lineLayer.setSegments(segmentBuffer, attitude, projection, viewport);
        lineLayer.draw(viewport);

        // --- 強調された星 ---------------------------------------------------
        pointBuffer.length = 0;
        for (const [hr, emphasis] of state.starEmphasis) {
          appendEmphasisPoint(pointBuffer, currentModel, hr, emphasis * opacity, 1);
        }
        for (const hr of handles.highlightHrs) {
          appendEmphasisPoint(pointBuffer, currentModel, hr, opacity, starStyle.highlightBoost);
        }
        if (pointBuffer.length > 0) {
          emphasisLayer.setPoints(pointBuffer);
          emphasisLayer.draw({ viewProjection, pixelRatio, opacity: 1 });
        }

        gl.endFrameEXP();
      };
      render();

      disposeRef.current = () => {
        cancelAnimationFrame(frameHandleRef.current);
        starLayer.dispose();
        emphasisLayer.dispose();
        lineLayer.dispose();
      };
    },
    [attitudeRef, handlesRef],
  );

  // 画面を離れるとき、描画ループと GPU 資源を確実に手放す。
  // GLView は onContextCreate の戻り値を見ないので、ここで止める必要がある。
  useEffect(
    () => () => {
      disposeRef.current?.();
      disposeRef.current = null;
    },
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {/* 背景を透過させ、下のカメラ映像をそのまま見せる。 */}
      <GLView style={styles.canvas} onContextCreate={onContextCreate} />
    </View>
  );
};

/**
 * 強調された星を 1 つ積む。
 * 通常の星の上に重ねて描くので、地平線の下や暗すぎて描かれていない星でも、
 * 演出や物語が触れているあいだは見える。
 */
const appendEmphasisPoint = (
  buffer: StarPoint[],
  model: SkyModel,
  hr: number,
  strength: number,
  sizeBoost: number,
): void => {
  if (strength <= 0.004) return;
  const index = model.snapshot.indexByHr.get(hr);
  if (index === undefined) return;
  const star = STAR_CATALOG[index];
  const direction: Vec3 = directionAt(model.snapshot, index);
  const tint = EMPHASIS_TINT * strength;
  buffer.push({
    direction,
    color: [
      star.color[0] + (EMBER[0] - star.color[0]) * tint,
      star.color[1] + (EMBER[1] - star.color[1]) * tint,
      star.color[2] + (EMBER[2] - star.color[2]) * tint,
    ],
    size: sizeForMagnitude(star.mag) * sizeBoost * (1 + EMPHASIS_SIZE_GAIN * strength),
    brightness: strength * EMPHASIS_ALPHA,
  });
};

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});
