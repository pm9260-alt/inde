/**
 * 姿勢推定の検証。
 *
 * 実機のセンサーを使わずに済むよう、既知の姿勢から重力と地磁気の観測値を
 * 逆算して与え、推定結果が元の姿勢に戻るかを見る。
 */
import { describe, expect, it } from 'vitest';

import {
  altitudeOf,
  azimuthOf,
  angleBetween,
  cross,
  DEG,
  dot,
  enuFromAltAz,
  normalize,
  quatAngleBetween,
  quatFromAxisAngle,
  quatFromMat3,
  quatMultiply,
  quatNormalize,
  rotate,
  rotateInverse,
  scale,
  sub,
  vec,
  type Quat,
  type Vec3,
} from '../astro/math';
import {
  angularVelocityFromDeviceMotion,
  attitudeFromGravityAndField,
  attitudeFromGravityOnly,
  DEFAULT_FUSION_TUNING,
  gravityFromDeviceMotion,
  INITIAL_FUSION_STATE,
  propagateByAngularVelocity,
  updateFusion,
} from './attitude';

/** 東京付近の地磁気。全磁力 46 マイクロテスラ、伏角 49°（下向きが正）。 */
const FIELD_ENU: Vec3 = (() => {
  const total = 46;
  const inclination = 49 * DEG;
  return vec(0, total * Math.cos(inclination), -total * Math.sin(inclination));
})();

const GRAVITY_ENU: Vec3 = vec(0, 0, -9.80665);

/**
 * 「背面カメラを (高度, 方位) の向きに構えた」ときの DEV → ENU 回転を作る。
 *
 * 端末座標系の 3 軸を ENU で表してから組み立てる。
 *   z_dev …… 画面から手前に出る向き。背面カメラは −z なので z = −視線方向。
 *   y_dev …… 画面の上辺。天頂に最も近くなるように取る。
 *   x_dev …… 右手系より y × z。
 * DEV → ENU の回転行列は、列がそれぞれ端末の x, y, z 軸を ENU で表したもの。
 * math.ts の quatFromMat3 は行優先で m[row * 3 + col] を取るので、
 * 列に軸を並べて渡す。
 */
const attitudeLookingAt = (altitudeDeg: number, azimuthDeg: number, rollDeg = 0): Quat => {
  const forward = enuFromAltAz(altitudeDeg, azimuthDeg);
  const zAxis = scale(forward, -1);

  const worldUp = vec(0, 0, 1);
  // 天頂成分から z 方向の成分を抜いたものが画面の上辺方向。
  const projected = sub(worldUp, scale(zAxis, dot(worldUp, zAxis)));
  // 真上・真下を向いていて上辺方向が定まらないときは北を基準にする。
  const yAxis =
    normalize(projected) ??
    normalize(sub(vec(0, 1, 0), scale(zAxis, dot(vec(0, 1, 0), zAxis))))!;
  const xAxis = cross(yAxis, zAxis);

  const q = quatFromMat3([
    xAxis.x, yAxis.x, zAxis.x,
    xAxis.y, yAxis.y, zAxis.y,
    xAxis.z, yAxis.z, zAxis.z,
  ]);
  if (rollDeg === 0) return q;
  // ロールは端末の z 軸まわりなので右から掛ける。
  return quatNormalize(quatMultiply(q, quatFromAxisAngle(vec(0, 0, 1), rollDeg * DEG)));
};

/** 与えた姿勢のときにセンサーが観測するはずの値。 */
const observationsFor = (attitude: Quat) => ({
  gravity: rotateInverse(attitude, GRAVITY_ENU),
  field: rotateInverse(attitude, FIELD_ENU),
});

describe('TRIAD による姿勢復元', () => {
  const poses: [string, number, number, number][] = [
    ['北の地平線', 0, 0, 0],
    ['東の地平線', 0, 90, 0],
    ['南西の低空', 15, 225, 0],
    ['天頂の手前', 80, 130, 0],
    ['真上', 89.5, 0, 0],
    ['傾けて構える', 40, 300, 35],
    ['横持ち', 25, 60, 90],
    ['逆さ', 50, 200, 180],
  ];

  for (const [name, alt, az, roll] of poses) {
    it(`${name} の姿勢を 0.001° 以内で復元する`, () => {
      const truth = attitudeLookingAt(alt, az, roll);
      const { gravity, field } = observationsFor(truth);
      const estimated = attitudeFromGravityAndField(gravity, field);
      expect(estimated).not.toBeNull();
      expect(quatAngleBetween(estimated!, truth)).toBeLessThan(0.001);
    });
  }

  it('天頂を通過しても姿勢が飛ばない（オイラー角の特異点に相当する領域）', () => {
    // 北の地平線から真上を越えて南側まで、端末の x 軸まわりに連続回転させる。
    // CMAttitude のオイラー角ならこの経路の途中（pitch = ±90°）で yaw と roll が
    // 縮退するが、ベクトルから直接組み立てる方式では何も起きないことを見る。
    const base = attitudeLookingAt(0, 0, 0);
    let previousEstimate: Quat | null = null;
    for (let pitch = 0; pitch <= 120; pitch += 0.5) {
      const truth = quatNormalize(
        quatMultiply(base, quatFromAxisAngle(vec(1, 0, 0), pitch * DEG)),
      );
      const { gravity, field } = observationsFor(truth);
      const estimated = attitudeFromGravityAndField(gravity, field);
      expect(estimated).not.toBeNull();
      // 真値との一致（天頂ちょうどでも劣化しない）
      expect(quatAngleBetween(estimated!, truth)).toBeLessThan(0.001);
      if (previousEstimate) {
        // 0.5° 刻みなので推定も 0.5° 前後しか動かない。跳びがあれば破綻。
        expect(quatAngleBetween(estimated!, previousEstimate)).toBeLessThan(0.6);
      }
      previousEstimate = estimated;
    }
  });

  it('磁場が未較正（ゼロ）なら null を返す', () => {
    expect(attitudeFromGravityAndField(vec(0, 0, -9.8), vec(0, 0, 0))).toBeNull();
  });

  it('磁場が鉛直に近く方位を決められないときは null を返す', () => {
    // 伏角 89° 相当。水平成分がほとんど無い。
    expect(attitudeFromGravityAndField(vec(0, 0, -9.8), vec(0, 0.8, -46))).toBeNull();
  });

  it('重力がゼロなら null を返す', () => {
    expect(attitudeFromGravityAndField(vec(0, 0, 0), vec(0, 30, -35))).toBeNull();
  });
});

describe('角速度による姿勢の伝播', () => {
  it('天頂軸まわりに 90 度回すと方位が 90 度動く', () => {
    const start = attitudeLookingAt(0, 0, 0);
    // 端末を「その場で左右に振る」= 端末の y 軸（画面の上下方向）まわり。
    // 端末を垂直に立てているとき、端末の +y は天頂を向いている。
    const rate = vec(0, -Math.PI / 2, 0); // rad/s
    let q = start;
    const dt = 0.01;
    for (let i = 0; i < 100; i += 1) {
      q = propagateByAngularVelocity(q, rate, dt);
    }
    const direction = rotate(q, vec(0, 0, -1));
    expect(altitudeOf(direction)).toBeCloseTo(0, 4);
    expect(azimuthOf(direction)).toBeCloseTo(90, 3);
  });

  it('角速度がゼロなら姿勢は変わらない', () => {
    const q = attitudeLookingAt(30, 120, 10);
    expect(propagateByAngularVelocity(q, vec(0, 0, 0), 0.016)).toBe(q);
  });
});

describe('融合フィルタ', () => {
  it('静止していれば真の姿勢に収束する', () => {
    const truth = attitudeLookingAt(35, 210, 12);
    const { gravity, field } = observationsFor(truth);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 200; i += 1) {
      state = updateFusion(state, gravity, field);
    }
    expect(state.attitude).not.toBeNull();
    expect(quatAngleBetween(state.attitude!, truth)).toBeLessThan(0.01);
  });

  it('磁場のノイズによる揺れを、生の観測より 3 分の 1 以下に抑える', () => {
    const truth = attitudeLookingAt(20, 45, 0);
    const { gravity, field } = observationsFor(truth);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 200; i += 1) state = updateFusion(state, gravity, field);
    const settled = state.attitude!;

    // 32bit に収まる線形合同法。JS の数値精度を超える乗算をすると系列が
    // 相関を持ち、白色ノイズの検証にならないため Math.imul を使う。
    let seed = 12345;
    const noise = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed / 4294967296 - 0.5) * 8; // ±4 マイクロテスラ
    };

    const samples = 1200;
    let filteredSq = 0;
    let rawSq = 0;
    let filteredPeak = 0;
    for (let i = 0; i < samples; i += 1) {
      const noisy = vec(field.x + noise(), field.y + noise(), field.z + noise());
      state = updateFusion(state, gravity, noisy);
      const filteredError = quatAngleBetween(state.attitude!, settled);
      filteredSq += filteredError * filteredError;
      filteredPeak = Math.max(filteredPeak, filteredError);
      // 同じサンプルを生の TRIAD にかけたときの誤差。
      const rawError = quatAngleBetween(attitudeFromGravityAndField(gravity, noisy)!, truth);
      rawSq += rawError * rawError;
    }
    const filteredRms = Math.sqrt(filteredSq / samples);
    const rawRms = Math.sqrt(rawSq / samples);

    expect(rawRms).toBeGreaterThan(3); // 前提が崩れていないことの確認
    expect(filteredRms).toBeLessThan(rawRms / 3);
    expect(filteredRms).toBeLessThan(1.0);
    expect(filteredPeak).toBeLessThan(2.5);
  });

  it('鉄骨などによる一時的な磁気外乱を無視する', () => {
    const truth = attitudeLookingAt(10, 300, 0);
    const { gravity, field } = observationsFor(truth);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 200; i += 1) state = updateFusion(state, gravity, field);
    const settled = state.attitude!;

    // 40 マイクロテスラの外乱が 30 サンプル続く。磁力も伏角も大きく変わる。
    const disturbance = vec(field.x + 40, field.y, field.z);
    for (let i = 0; i < 30; i += 1) state = updateFusion(state, gravity, disturbance);
    expect(state.magneticDisturbed).toBe(true);
    expect(quatAngleBetween(state.attitude!, settled)).toBeLessThan(0.5);
  });

  it('傾きは磁場の平滑化に引きずられず即座に追従する', () => {
    const start = attitudeLookingAt(10, 90, 0);
    const observationsStart = observationsFor(start);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 200; i += 1) {
      state = updateFusion(state, observationsStart.gravity, observationsStart.field);
    }
    // 方位はそのまま、仰角だけ 10° → 60° に大きく動かす。
    const moved = attitudeLookingAt(60, 90, 0);
    const observationsMoved = observationsFor(moved);
    for (let i = 0; i < 20; i += 1) {
      state = updateFusion(state, observationsMoved.gravity, observationsMoved.field);
    }
    const direction = rotate(state.attitude!, vec(0, 0, -1));
    // 20 サンプル（60Hz で 0.33 秒）あれば 0.5° 以内まで追いつく。
    expect(Math.abs(altitudeOf(direction) - 60)).toBeLessThan(0.5);
  });

  it('磁場が未較正なら姿勢を返さない', () => {
    const state = updateFusion(INITIAL_FUSION_STATE, vec(0, 0, -9.8), vec(0, 0, 0));
    expect(state.attitude).toBeNull();
    expect(state.fieldMagnitude).toBe(0);
  });

  it('収束後に磁場が失われても、それまでの姿勢を保つ', () => {
    const truth = attitudeLookingAt(30, 100, 0);
    const { gravity, field } = observationsFor(truth);
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 300; i += 1) state = updateFusion(state, gravity, field);
    const settled = state.attitude!;
    state = updateFusion(state, gravity, vec(0, 0, 0));
    // 姿勢は捨てられず、動いてもいない。
    expect(state.attitude).not.toBeNull();
    expect(quatAngleBetween(state.attitude!, settled)).toBeLessThan(0.001);
    expect(state.fieldMagnitude).toBe(0);
  });
});

describe('expo-sensors の値の読み替え', () => {
  it('重力は加速度の差分から得られる', () => {
    const g = gravityFromDeviceMotion(
      { x: 0.1, y: -0.2, z: 0.3 },
      { x: 0.1, y: -0.2, z: -9.5 },
    );
    expect(g.x).toBeCloseTo(0, 10);
    expect(g.y).toBeCloseTo(0, 10);
    expect(g.z).toBeCloseTo(-9.8, 10);
  });

  it('角速度は alpha=z, beta=y, gamma=x の度/秒として読む', () => {
    const w = angularVelocityFromDeviceMotion({ alpha: 90, beta: 45, gamma: 180 });
    expect(w.x).toBeCloseTo(Math.PI, 10);
    expect(w.y).toBeCloseTo(Math.PI / 4, 10);
    expect(w.z).toBeCloseTo(Math.PI / 2, 10);
  });

  it('角速度が無いときはゼロを返す', () => {
    const w = angularVelocityFromDeviceMotion(null);
    expect(w).toEqual(vec(0, 0, 0));
  });
});

describe('観測モデルの妥当性', () => {
  it('北の水平を向いた端末では重力が画面の下向き成分になる', () => {
    const truth = attitudeLookingAt(0, 0, 0);
    const { gravity } = observationsFor(truth);
    // 端末を垂直に立てているので、重力は端末の −y（画面の下）を向く。
    expect(gravity.x).toBeCloseTo(0, 6);
    expect(gravity.y).toBeCloseTo(-9.80665, 6);
    expect(gravity.z).toBeCloseTo(0, 6);
  });

  it('画面を上にして水平に置いた端末では重力が −z', () => {
    // 背面カメラが真下を向く = 高度 −90°。
    const truth = attitudeLookingAt(-90, 0, 0);
    const { gravity } = observationsFor(truth);
    expect(gravity.z).toBeCloseTo(-9.80665, 6);
  });

  it('方位の補正は傾きの補正よりゆっくりに設定されている', () => {
    // この順序が崩れると「上下だけ追従が遅い」「方位が揺れる」の両方が起きる。
    expect(DEFAULT_FUSION_TUNING.headingCorrection).toBeGreaterThan(0);
    expect(DEFAULT_FUSION_TUNING.headingCorrection).toBeLessThan(
      DEFAULT_FUSION_TUNING.tiltCorrection,
    );
    expect(DEFAULT_FUSION_TUNING.tiltCorrection).toBeLessThanOrEqual(1);
  });

  it('視線方向と姿勢から求めた方向が一致する', () => {
    const truth = attitudeLookingAt(33, 147, 20);
    const direction = rotate(truth, vec(0, 0, -1));
    expect(angleBetween(direction, enuFromAltAz(33, 147))).toBeLessThan(1e-6);
  });
});

describe('地磁気が使えないときの継続', () => {
  it('傾きは重力だけで厳密に求まる', () => {
    const before = attitudeLookingAt(20, 130, 0);
    const after = attitudeLookingAt(55, 130, 0);
    const estimated = attitudeFromGravityOnly(observationsFor(after).gravity, before);
    expect(estimated).not.toBeNull();
    expect(altitudeOf(rotate(estimated!, vec(0, 0, -1)))).toBeCloseTo(55, 3);
  });

  it('姿勢が少しずつ変わるあいだは方位も引き継がれる', () => {
    // 実際のセンサーは毎秒 60 回来るので、1 回あたりの変化はごく小さい。
    // その範囲では、引き継ぎの近似誤差は現れない。
    let attitude = attitudeLookingAt(20, 130, 0);
    for (let alt = 20.5; alt <= 55; alt += 0.5) {
      const next = attitudeFromGravityOnly(
        observationsFor(attitudeLookingAt(alt, 130, 0)).gravity,
        attitude,
      );
      expect(next).not.toBeNull();
      attitude = next!;
    }
    const direction = rotate(attitude, vec(0, 0, -1));
    expect(altitudeOf(direction)).toBeCloseTo(55, 3);
    // 35° 持ち上げるあいだに積もる方位のずれは 0.2° 未満。
    // 表示誤差の目標 0.3° に対しても、地磁気の誤差 3〜10° に対しても十分小さい。
    expect(Math.abs(azimuthOf(direction) - 130)).toBeLessThan(0.2);
  });

  it('前の姿勢が無くても傾きは正しく、方位だけが任意になる', () => {
    const truth = attitudeLookingAt(40, 77, 0);
    const estimated = attitudeFromGravityOnly(observationsFor(truth).gravity, null);
    expect(estimated).not.toBeNull();
    expect(altitudeOf(rotate(estimated!, vec(0, 0, -1)))).toBeCloseTo(40, 3);
  });

  it('重力がゼロなら作れない', () => {
    expect(attitudeFromGravityOnly(vec(0, 0, 0), null)).toBeNull();
  });

  it('磁場が失われたあとも、傾きを追いながら方位を保つ', () => {
    const observations = observationsFor(attitudeLookingAt(15, 200, 0));
    let state = INITIAL_FUSION_STATE;
    for (let i = 0; i < 300; i += 1) {
      state = updateFusion(state, observations.gravity, observations.field);
    }
    const settledAzimuth = azimuthOf(rotate(state.attitude!, vec(0, 0, -1)));

    // 磁場が失われたまま、15° → 60° へゆっくり持ち上げる（実際の動きの速さ）。
    for (let alt = 15; alt <= 60; alt += 0.5) {
      const moved = observationsFor(attitudeLookingAt(alt, 200, 0));
      state = updateFusion(state, moved.gravity, vec(0, 0, 0));
    }
    // 補正は 1 回あたり一部しか進まないので、追いつくまで少し余分に回す。
    const settled = observationsFor(attitudeLookingAt(60, 200, 0));
    for (let i = 0; i < 40; i += 1) {
      state = updateFusion(state, settled.gravity, vec(0, 0, 0));
    }

    const direction = rotate(state.attitude!, vec(0, 0, -1));
    expect(altitudeOf(direction)).toBeCloseTo(60, 1);
    // 方位は磁場が無くても保たれている。
    expect(Math.abs(azimuthOf(direction) - settledAzimuth)).toBeLessThan(0.5);
  });

  it('本番では、地磁気が無いまま姿勢を作り始めない', () => {
    const truth = attitudeLookingAt(35, 90, 0);
    const state = updateFusion(
      INITIAL_FUSION_STATE,
      observationsFor(truth).gravity,
      vec(0, 0, 0),
    );
    expect(state.attitude).toBeNull();
  });

  it('デモでは、地磁気が無くても姿勢を作り始める', () => {
    const truth = attitudeLookingAt(35, 90, 0);
    const state = updateFusion(
      INITIAL_FUSION_STATE,
      observationsFor(truth).gravity,
      vec(0, 0, 0),
      DEFAULT_FUSION_TUNING,
      { allowHeadingFreeStart: true },
    );
    expect(state.attitude).not.toBeNull();
    // 傾きは正しい。方位は任意でよい。
    expect(altitudeOf(rotate(state.attitude!, vec(0, 0, -1)))).toBeCloseTo(35, 2);
  });
});

describe('方位を問わない状態（デモ）', () => {
  const freeTuning = { ...DEFAULT_FUSION_TUNING, headingCorrection: 0 };

  it('地磁気が使えるようになっても方位が引き寄せられない', () => {
    // 屋内では地磁気が遅れて使えるようになることがある。そのとき方位が
    // 磁北へ吸われると、置いた星座がずれていく。
    const truth = attitudeLookingAt(35, 90, 0);
    const { gravity, field } = observationsFor(truth);

    // まず磁場なしで立ち上げる。
    let state = updateFusion(INITIAL_FUSION_STATE, gravity, vec(0, 0, 0), freeTuning, {
      allowHeadingFreeStart: true,
    });
    const startAzimuth = azimuthOf(rotate(state.attitude!, vec(0, 0, -1)));

    // 途中から磁場が来ても、方位は動かない。
    for (let i = 0; i < 300; i += 1) {
      state = updateFusion(state, gravity, field, freeTuning, { allowHeadingFreeStart: true });
    }
    const endAzimuth = azimuthOf(rotate(state.attitude!, vec(0, 0, -1)));
    expect(Math.abs(endAzimuth - startAzimuth)).toBeLessThan(0.5);
  });

  it('方位を止めても傾きは追従する', () => {
    let state = updateFusion(
      INITIAL_FUSION_STATE,
      observationsFor(attitudeLookingAt(10, 90, 0)).gravity,
      vec(0, 0, 0),
      freeTuning,
      { allowHeadingFreeStart: true },
    );
    const moved = observationsFor(attitudeLookingAt(65, 90, 0));
    for (let i = 0; i < 60; i += 1) {
      state = updateFusion(state, moved.gravity, moved.field, freeTuning, {
        allowHeadingFreeStart: true,
      });
    }
    expect(altitudeOf(rotate(state.attitude!, vec(0, 0, -1)))).toBeCloseTo(65, 1);
  });

  it('本番の設定では方位が磁北へ収束する', () => {
    // 上の挙動が、デモ専用の設定によるものだと示しておく。
    const truth = attitudeLookingAt(35, 90, 0);
    const { gravity, field } = observationsFor(truth);
    let state = updateFusion(INITIAL_FUSION_STATE, gravity, vec(0, 0, 0), DEFAULT_FUSION_TUNING, {
      allowHeadingFreeStart: true,
    });
    for (let i = 0; i < 600; i += 1) {
      state = updateFusion(state, gravity, field);
    }
    expect(quatAngleBetween(state.attitude!, truth)).toBeLessThan(0.5);
  });
});
