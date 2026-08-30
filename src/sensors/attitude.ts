/**
 * 端末の姿勢推定（純粋関数）。
 *
 * なぜ expo-sensors の DeviceMotion.rotation をそのまま使わないか
 * ---------------------------------------------------------------------------
 * expo-sensors が返す姿勢はオイラー角（yaw/pitch/roll）だけで、クォータニオンは
 * 公開されていない。CMAttitude のオイラー角は pitch が ±90° で特異点を持ち、
 * yaw と roll が縮退する。そして pitch = ±90° は「端末を立てて地平線の方向を
 * 見る」姿勢、つまり地平線近くの星座を探すときの姿勢そのもの。ここで表示が
 * 暴れると、このアプリは成立しない。
 *
 * 代わりに、特異点を持たない 2 つのベクトルから姿勢を組み立てる。
 *
 *   重力  : CMDeviceMotion がジャイロと融合済みの値を返す。低ノイズ・無ドリフト。
 *           expo-sensors では accelerationIncludingGravity − acceleration で得られる。
 *   地磁気: CMDeviceMotion の較正済み磁場。方位の絶対基準になるが、鉄骨・電線・
 *           車などの影響を受けやすくノイズが大きい。
 *
 * この 2 本から TRIAD 法で回転行列を直接作る（オイラー角を経由しない）。
 * さらに、
 *   ・傾き（2 自由度）は重力から即座に反映する
 *   ・方位（1 自由度）は磁場を世界座標系で平滑化してからゆっくり反映する
 *   ・その間の追従はジャイロの角速度で補間する
 * という役割分担にする。世界座標系での地磁気は本来一定ベクトルなので、
 * そこで平均を取るのが正しい。端末座標系で平均を取ると端末の回転そのものを
 * 鈍らせてしまう。
 */
import {
  cross,
  DEG,
  dot,
  length,
  normalize,
  quatConjugate,
  quatFromMat3,
  quatMultiply,
  quatNormalize,
  QUAT_IDENTITY,
  rotateInverse,
  scale,
  slerp,
  sub,
  vec,
  type Mat3,
  type Quat,
  type Vec3,
} from '../astro/math';

/** 磁場ベクトルがこれより短ければ、未較正とみなす（マイクロテスラ）。 */
const MIN_FIELD_MAGNITUDE_UT = 5;

/**
 * 地磁気の水平成分がこれより短ければ方位を決められない。
 * 全磁力に対する比で判定する（伏角 85° 相当）。
 */
const MIN_HORIZONTAL_FIELD_RATIO = 0.087;

/**
 * 重力と地磁気から姿勢（DEV → 磁北基準 ENU）を作る。
 * 方位が決められない場合は null を返す。呼び出し側で較正を促すこと。
 */
export const attitudeFromGravityAndField = (
  gravity: Vec3,
  magneticField: Vec3,
): Quat | null => {
  // 重力は地球の中心を向くので、天頂はその逆。
  const up = normalize(scale(gravity, -1));
  if (!up) return null;

  const fieldMagnitude = length(magneticField);
  if (fieldMagnitude < MIN_FIELD_MAGNITUDE_UT) return null;

  // 磁場から鉛直成分を抜いた水平成分が磁北を指す。
  const vertical = dot(magneticField, up);
  const horizontal = sub(magneticField, scale(up, vertical));
  if (length(horizontal) / fieldMagnitude < MIN_HORIZONTAL_FIELD_RATIO) return null;
  const north = normalize(horizontal);
  if (!north) return null;

  // ENU は右手系で 北 × 天頂 = 東。
  const east = normalize(cross(north, up));
  if (!east) return null;

  // 行が ENU の各軸を端末座標で表した行列は、DEV → ENU の回転になる。
  const matrix: Mat3 = [
    east.x, east.y, east.z,
    north.x, north.y, north.z,
    up.x, up.y, up.z,
  ];
  return quatFromMat3(matrix);
};

/**
 * 重力だけから姿勢を作る。
 *
 * 保証するのは**傾きだけ**。方位は前の推定から引き継ぐが、その引き継ぎは
 * 近似でしかない（前の姿勢での「北」を、いまの端末座標のものとして使うため、
 * 姿勢が大きく変わった直後はずれる）。
 *
 * これで足りるのは、この値を updateFusion が swing 成分だけ取り出して使う
 * から。天頂軸まわりの成分は捨てられるので、方位の近似誤差は入らない。
 * 第二の軸を定めるための足場、と考えるのが正しい。
 *
 * 使いどころは 2 つ。
 *   ・地磁気が一時的に使えなくなったとき。傾きだけでも追従を続けたほうが、
 *     表示が固まるより良い。方位は直前の推定が保たれる。
 *   ・デモモード。実際の方角と合っている必要がないので、方位は任意でよい。
 *
 * @param previous 前の姿勢。無い場合は方位を任意に決める。
 */
export const attitudeFromGravityOnly = (gravity: Vec3, previous: Quat | null): Quat | null => {
  const up = normalize(scale(gravity, -1));
  if (!up) return null;

  // 前の姿勢が指していた北を端末座標へ戻し、天頂成分を抜いて水平にする。
  // 前が無ければ、天頂と平行でない適当な軸から作る。
  const reference = previous
    ? rotateInverse(previous, vec(0, 1, 0))
    : Math.abs(up.z) < 0.9
      ? vec(0, 0, 1)
      : vec(1, 0, 0);
  const north = normalize(sub(reference, scale(up, dot(reference, up))));
  if (!north) return null;

  const east = normalize(cross(north, up));
  if (!east) return null;

  return quatFromMat3([
    east.x, east.y, east.z,
    north.x, north.y, north.z,
    up.x, up.y, up.z,
  ]);
};

/** 角速度（端末座標系, rad/s）で姿勢を dt 秒ぶん進める。 */
export const propagateByAngularVelocity = (
  attitude: Quat,
  angularVelocity: Vec3,
  dt: number,
): Quat => {
  if (dt <= 0) return attitude;
  const speed = length(angularVelocity);
  if (speed < 1e-7) return attitude;
  const angle = speed * dt;
  const half = angle / 2;
  const s = Math.sin(half) / speed;
  // 角速度は端末座標系なので右から掛ける（q_new = q ⊗ δq）。
  const delta: Quat = {
    w: Math.cos(half),
    x: angularVelocity.x * s,
    y: angularVelocity.y * s,
    z: angularVelocity.z * s,
  };
  return quatNormalize(quatMultiply(attitude, delta));
};

/* --------------------------------------------------------------------------
 * 傾きと方位を分けて補正する
 * --------------------------------------------------------------------------
 * TRIAD の結果をそのまま採用すると、磁気ノイズがそのまま画面の揺れになる
 * （東京付近の水平磁力 30μT に対して 4μT のノイズは方位 7.6° の揺れに相当）。
 * かといって姿勢全体を鈍らせると、仰角の追従まで遅れて「上下だけ遅い」と
 * 感じる挙動になる。
 *
 * そこで、現在の推定から観測へ向かう回転を「天頂軸まわり（方位）」と
 * 「水平軸まわり（傾き）」に分解し、別々の速さで適用する。
 * 分解は swing-twist 分解（twist が指定軸まわりの成分）で行う。
 */

/** クォータニオンを単位回転から t の割合だけ進めたもの。 */
const partialRotation = (q: Quat, t: number): Quat => slerp(QUAT_IDENTITY, q, t);

/**
 * 回転を、指定軸まわりの成分（twist）とそれ以外（swing）に分ける。
 * delta = swing ⊗ twist が成り立つ。軸は単位ベクトルの z 軸に固定する。
 */
const splitAroundVertical = (delta: Quat): { twist: Quat; swing: Quat } => {
  const norm = Math.hypot(delta.w, delta.z);
  if (norm < 1e-9) {
    // 水平軸まわりにちょうど 180° の回転。天頂軸成分は定義できない。
    return { twist: QUAT_IDENTITY, swing: delta };
  }
  const twist: Quat = { w: delta.w / norm, x: 0, y: 0, z: delta.z / norm };
  const swing = quatMultiply(delta, quatConjugate(twist));
  return { twist, swing };
};

export interface FusionTuning {
  /**
   * 傾き（水平軸まわり）を観測へ寄せる割合。重力は既にジャイロ融合済みで
   * ノイズが小さいため大きくしてよい。60Hz で 0.5 なら数フレームで追いつく。
   */
  readonly tiltCorrection: number;
  /**
   * 方位（天頂軸まわり）を観測へ寄せる割合。磁気ノイズを均すため小さくする。
   * 0.02 は 60Hz でおよそ 0.8 秒の時定数。速い動きはジャイロが埋める。
   */
  readonly headingCorrection: number;
  /** 磁力がこの値より大きく平均から外れたら、周囲の鉄などの影響とみなす。 */
  readonly fieldMagnitudeToleranceUt: number;
  /** 伏角がこの値より大きく平均から外れたら同様に外乱とみなす。 */
  readonly fieldInclinationToleranceDeg: number;
  /** 磁力・伏角の基準値を追従させる速さ。場所の移動に追いつく程度でよい。 */
  readonly fieldBaselineSmoothing: number;
}

export const DEFAULT_FUSION_TUNING: FusionTuning = {
  tiltCorrection: 0.5,
  headingCorrection: 0.02,
  fieldMagnitudeToleranceUt: 10,
  fieldInclinationToleranceDeg: 12,
  fieldBaselineSmoothing: 0.01,
};

/** 融合の振る舞いを切り替える。 */
export interface FusionOptions {
  /**
   * 地磁気が使えないまま姿勢を作り始めてよいか。
   * 方位が任意の値になるので、実際の空を重ねる本番では false。
   * 方角が合っている必要のないデモでのみ true にする。
   */
  readonly allowHeadingFreeStart: boolean;
}

export const DEFAULT_FUSION_OPTIONS: FusionOptions = { allowHeadingFreeStart: false };

export interface FusionState {
  /** DEV → 磁北基準 ENU。まだ観測が得られていなければ null。 */
  readonly attitude: Quat | null;
  /** 磁力の基準値（マイクロテスラ）。 */
  readonly baselineMagnitudeUt: number;
  /** 伏角の基準値（度）。重力方向との角度から求めるので姿勢に依存しない。 */
  readonly baselineInclinationDeg: number;
  /** 直近のサンプルが磁気外乱だったか。 */
  readonly magneticDisturbed: boolean;
  /** 直近の磁力（マイクロテスラ）。0 なら未較正。 */
  readonly fieldMagnitude: number;
}

export const INITIAL_FUSION_STATE: FusionState = {
  attitude: null,
  baselineMagnitudeUt: 0,
  baselineInclinationDeg: 0,
  magneticDisturbed: false,
  fieldMagnitude: 0,
};

const emaScalar = (current: number, sample: number, alpha: number): number =>
  current + (sample - current) * alpha;

/**
 * 重力と地磁気の新しい観測で姿勢を更新する。
 *
 * 外乱の判定は姿勢に依存しない 2 つの量で行う。
 *   ・磁力の大きさ
 *   ・重力方向と磁場のなす角（伏角）
 * どちらも本来その場所では一定なので、急に変われば周囲の金属などが原因と
 * 判断できる。外乱のあいだは方位の補正だけを止め、傾きの追従は続ける。
 */
export const updateFusion = (
  state: FusionState,
  gravity: Vec3,
  magneticField: Vec3,
  tuning: FusionTuning = DEFAULT_FUSION_TUNING,
  options: FusionOptions = DEFAULT_FUSION_OPTIONS,
): FusionState => {
  const fieldMagnitude = length(magneticField);
  const observed = attitudeFromGravityAndField(gravity, magneticField);
  if (!observed) {
    // 地磁気が使えない。傾きだけは重力から追い続ける。
    // 方位は前の推定を引き継ぐので、ここで狂うことはない。
    const fallback = attitudeFromGravityOnly(
      gravity,
      state.attitude ?? (options.allowHeadingFreeStart ? null : QUAT_IDENTITY),
    );
    if (!fallback || (!state.attitude && !options.allowHeadingFreeStart)) {
      return { ...state, magneticDisturbed: false, fieldMagnitude };
    }
    if (!state.attitude) {
      // 方位を問わない用途（デモ）でのみ、磁気なしで始める。
      return { ...state, attitude: fallback, magneticDisturbed: false, fieldMagnitude };
    }
    const delta = quatMultiply(fallback, quatConjugate(state.attitude));
    const { swing } = splitAroundVertical(delta);
    return {
      ...state,
      attitude: quatNormalize(
        quatMultiply(partialRotation(swing, tuning.tiltCorrection), state.attitude),
      ),
      magneticDisturbed: false,
      fieldMagnitude,
    };
  }

  const up = normalize(scale(gravity, -1));
  // attitudeFromGravityAndField が成功した時点で重力は正規化できている。
  const inclinationDeg = up
    ? 90 - Math.acos(Math.max(-1, Math.min(1, dot(magneticField, up) / fieldMagnitude))) * (180 / Math.PI)
    : 0;

  // 姿勢がまだ無ければ、観測をそのまま採用する。
  if (!state.attitude) {
    return {
      attitude: observed,
      baselineMagnitudeUt: fieldMagnitude,
      baselineInclinationDeg: inclinationDeg,
      magneticDisturbed: false,
      fieldMagnitude,
    };
  }

  // 傾きだけで立ち上げたあとに地磁気が使えるようになった場合。
  // 姿勢はすでにあるので置き換えない。基準値だけを埋めて、方位を
  // どれだけ寄せるかは通常の補正（headingCorrection）に委ねる。
  // ここで観測をそのまま採用すると、デモ中に空が回ってしまう。
  const attitude = state.attitude;
  const current: FusionState =
    state.baselineMagnitudeUt === 0
      ? { ...state, baselineMagnitudeUt: fieldMagnitude, baselineInclinationDeg: inclinationDeg }
      : state;

  const disturbed =
    Math.abs(fieldMagnitude - current.baselineMagnitudeUt) > tuning.fieldMagnitudeToleranceUt ||
    Math.abs(inclinationDeg - current.baselineInclinationDeg) > tuning.fieldInclinationToleranceDeg;

  // 外乱中は基準値を汚さない。
  const baselineMagnitudeUt = disturbed
    ? current.baselineMagnitudeUt
    : emaScalar(current.baselineMagnitudeUt, fieldMagnitude, tuning.fieldBaselineSmoothing);
  const baselineInclinationDeg = disturbed
    ? current.baselineInclinationDeg
    : emaScalar(current.baselineInclinationDeg, inclinationDeg, tuning.fieldBaselineSmoothing);

  // 現在の推定から観測へ向かう回転（ENU での回転）。
  const delta = quatMultiply(observed, quatConjugate(attitude));
  const { twist, swing } = splitAroundVertical(delta);
  const headingGain = disturbed ? 0 : tuning.headingCorrection;
  const correction = quatMultiply(
    partialRotation(swing, tuning.tiltCorrection),
    partialRotation(twist, headingGain),
  );

  return {
    attitude: quatNormalize(quatMultiply(correction, attitude)),
    baselineMagnitudeUt,
    baselineInclinationDeg,
    magneticDisturbed: disturbed,
    fieldMagnitude,
  };
};

/**
 * expo-sensors の DeviceMotion が返す値から重力ベクトルを取り出す。
 * accelerationIncludingGravity = (ユーザー加速度 + 重力) × g
 * acceleration                 = ユーザー加速度 × g
 * なので差が重力（m/s^2、端末が水平で画面が上なら (0, 0, -9.8)）。
 */
export const gravityFromDeviceMotion = (
  acceleration: { x: number; y: number; z: number } | null,
  accelerationIncludingGravity: { x: number; y: number; z: number },
): Vec3 => {
  if (!acceleration) {
    return vec(
      accelerationIncludingGravity.x,
      accelerationIncludingGravity.y,
      accelerationIncludingGravity.z,
    );
  }
  return vec(
    accelerationIncludingGravity.x - acceleration.x,
    accelerationIncludingGravity.y - acceleration.y,
    accelerationIncludingGravity.z - acceleration.z,
  );
};

/**
 * expo-sensors の rotationRate を端末座標系の角速度（rad/s）に直す。
 * expo は alpha = z 軸まわり, beta = y 軸まわり, gamma = x 軸まわり を
 * 度/秒 で返す（packages/expo-sensors/ios/DeviceMotionModule.swift）。
 */
export const angularVelocityFromDeviceMotion = (rotationRate: {
  alpha: number;
  beta: number;
  gamma: number;
} | null): Vec3 => {
  if (!rotationRate) return vec(0, 0, 0);
  return vec(rotationRate.gamma * DEG, rotationRate.beta * DEG, rotationRate.alpha * DEG);
};
