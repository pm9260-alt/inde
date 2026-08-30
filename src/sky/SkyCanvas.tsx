/**
 * 星空の描画面。カメラ映像の上に重ねる。
 *
 * React の再描画とは切り離してある。姿勢は ref から毎フレーム読み、
 * 選択状態などの変化も ref を介して渡す。星空が 60fps で動いているあいだ、
 * React は何もしない。
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { Quat } from '../astro/math';
import { makeProjection, type CameraProjection, type Viewport } from '../astro/projection';
import { rgbFromHex } from '../design/color';
import { color, duration, stroke } from '../design/tokens';
import { LineLayer, type SkySegment } from './gl/lineLayer';
import { StarLayer } from './gl/starLayer';
import {
  identityMat4,
  multiplyMat4,
  perspectiveMatrix,
  viewMatrixFromAttitude,
} from './matrix';
import type { SkyModel } from './useSkyModel';

const LINE_REST = rgbFromHex(color.sky.line);
const LINE_GUIDE = rgbFromHex(color.sky.guide);
const LINE_ACTIVE = rgbFromHex(color.ember.core);

/** 未選択・未照準の星座線の濃さ。空を邪魔しない程度に抑える。 */
const OPACITY_IDLE = 0.3;
/** 端末を向けている星座の線。 */
const OPACITY_AIMED = 0.72;
/** 選択した星座の線。 */
const OPACITY_SELECTED = 0.95;

export interface SkyCanvasHandles {
  /** 端末が向いている先の星座 ID。線を明るくする。 */
  aimedId: string | null;
  /** 選択中の星座 ID。線を橙にして描き進める。 */
  selectedId: string | null;
  /** 星空全体の不透明度。神話を読むあいだ沈める。 */
  opacity: number;
  /** いま物語が語っている星。大きく橙に描く。 */
  highlightHrs: ReadonlySet<number>;
}

interface Props {
  readonly model: SkyModel;
  readonly attitudeRef: React.RefObject<Quat>;
  /** 選択・照準の状態。毎フレーム読むので ref で渡す。 */
  readonly handlesRef: React.RefObject<SkyCanvasHandles>;
  readonly verticalFovDeg: number;
}

export const SkyCanvas = ({ model, attitudeRef, handlesRef, verticalFovDeg }: Props) => {
  const viewportRef = useRef<Viewport>({ width: 1, height: 1 });
  const projectionRef = useRef<CameraProjection>(makeProjection({ width: 1, height: 1 }, verticalFovDeg));
  const modelRef = useRef(model);
  const starLayerRef = useRef<StarLayer | null>(null);
  const lineLayerRef = useRef<LineLayer | null>(null);
  /** 星空データを送り直す必要があるか。 */
  const starsDirtyRef = useRef(true);
  /** 選択が変わった時刻。線を引く演出の起点。 */
  const selectionStartRef = useRef(0);
  const previousSelectedRef = useRef<string | null>(null);
  /** 実行中の描画ループ。画面を離れるときに止める。 */
  const frameHandleRef = useRef(0);
  const disposeRef = useRef<(() => void) | null>(null);
  /** 直前に頂点バッファへ反映した強調対象。変わったときだけ作り直す。 */
  const highlightRef = useRef<ReadonlySet<number> | null>(null);

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

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const starLayer = new StarLayer(gl);
    const lineLayer = new LineLayer(gl);
    starLayerRef.current = starLayer;
    lineLayerRef.current = lineLayer;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    // 星も星座線も「光」なので加算合成。あらかじめ色に不透明度を掛けてある。
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const viewMatrix = identityMat4();
    const projectionMatrix = identityMat4();
    const viewProjection = identityMat4();
    const segmentBuffer: SkySegment[] = [];

    const render = () => {
      frameHandleRef.current = requestAnimationFrame(render);

      const viewport = viewportRef.current;
      const projection = projectionRef.current;
      const attitude = attitudeRef.current;
      const handles = handlesRef.current;
      const currentModel = modelRef.current;
      const pixelRatio = viewport.width > 0 ? gl.drawingBufferWidth / viewport.width : 1;

      if (starsDirtyRef.current || highlightRef.current !== handles.highlightHrs) {
        highlightRef.current = handles.highlightHrs;
        starLayer.setStars(
          currentModel.snapshot.directions,
          currentModel.snapshot.altitudes,
          currentModel.brightness,
          handles.highlightHrs,
        );
        starsDirtyRef.current = false;
      }

      if (previousSelectedRef.current !== handles.selectedId) {
        previousSelectedRef.current = handles.selectedId;
        selectionStartRef.current = Date.now();
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

      starLayer.draw({ viewProjection, pixelRatio, opacity: handles.opacity });

      // 星座線を組み立てる。選択中の星座は端から引かれていく。
      const drawProgress = handles.selectedId
        ? Math.min(1, (Date.now() - selectionStartRef.current) / duration.draw)
        : 1;
      segmentBuffer.length = 0;
      for (const segment of currentModel.segments) {
        const selected = segment.asterismId === handles.selectedId;
        const aimed = segment.asterismId === handles.aimedId;
        segmentBuffer.push({
          from: segment.from,
          to: segment.to,
          color: selected ? LINE_ACTIVE : aimed ? LINE_REST : LINE_GUIDE,
          opacity:
            (selected ? OPACITY_SELECTED : aimed ? OPACITY_AIMED : OPACITY_IDLE) *
            handles.opacity,
          width: selected ? stroke.lineActive : stroke.line,
          progress: selected ? drawProgress : 1,
        });
      }
      lineLayer.setSegments(segmentBuffer, attitude, projection, viewport);
      lineLayer.draw(viewport);

      gl.endFrameEXP();
    };
    render();

    disposeRef.current = () => {
      cancelAnimationFrame(frameHandleRef.current);
      starLayer.dispose();
      lineLayer.dispose();
      starLayerRef.current = null;
      lineLayerRef.current = null;
    };
  }, [attitudeRef, handlesRef]);

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
