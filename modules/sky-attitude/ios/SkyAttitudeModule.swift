import ARKit
import CoreMotion
import ExpoModulesCore

/**
 CMDeviceMotion の姿勢クォータニオンをそのまま JS へ渡すモジュール。

 なぜ必要か
 --------------------------------------------------------------------------
 expo-sensors の DeviceMotion はオイラー角しか公開しない。CMAttitude の
 オイラー角は pitch = ±90°（端末を立てて地平線の方向を見る姿勢）で特異点を
 持ち、そこで yaw と roll が縮退する。星座アプリはまさにその姿勢を多用する。
 クォータニオンには特異点が無い。

 さらに、参照フレームに .xTrueNorthZVertical を使えば、姿勢が最初から
 真北基準になる。磁気偏角の補正が要らず、Apple 自身のセンサー融合
 （加速度・ジャイロ・地磁気）の結果をそのまま利用できる。

 回転行列の向きについて
 --------------------------------------------------------------------------
 CMAttitude の rotationMatrix が「参照フレーム → 端末」なのか
 「端末 → 参照フレーム」なのかは、Apple のドキュメントに明記されていない。
 推測で決めると、実機で 90 度ずれるまで気づけない種類の誤りになる。

 そこで実行時に判定する。重力ベクトル motion.gravity は端末座標系で
 与えられることが確かなので、これを行列で回した結果が参照フレームでの
 重力、すなわち (0, 0, -1) に一致するかどうかを見ればよい。
 端末が水平に近いと両方の解釈が同じ結果になるため、差がはっきり出る
 姿勢になるまで判定を保留する。星空に向けて端末を傾ければ、すぐに決まる。

 JS へ渡すのは常に「端末 → 参照フレーム」の回転。
 参照フレームは x = 北, y = 西, z = 天頂 なので、ENU への読み替えは
 JS 側（NativeOrientationProvider）で行う。
 */
public final class SkyAttitudeModule: Module {
  private let motionManager = CMMotionManager()
  private let queue = OperationQueue()

  /// 姿勢の更新間隔。画面の更新に合わせて 60Hz。
  private let updateInterval = 1.0 / 60.0

  /// 二つの解釈の誤差がこれ以上離れていれば、どちらが正しいか判定できる。
  private let conventionMargin = 0.2

  /// true なら rotationMatrix は「端末 → 参照フレーム」。未判定なら nil。
  private var matrixMapsDeviceToReference: Bool?

  /// 参照フレームが真北基準か。false なら磁北基準なので JS 側で偏角の補正が要る。
  private var usingTrueNorth = false

  public func definition() -> ModuleDefinition {
    Name("SkyAttitude")

    Events("onAttitude", "onArkitAttitude", "onArkitFailure")

    Function("isAvailable") { () -> Bool in
      self.motionManager.isDeviceMotionAvailable
    }

    // MARK: - ARKit 経路
    //
    // CoreMotion の経路とは独立して動く。どちらを使うかは JavaScript が決める。
    // ARKit はカメラ映像の特徴点追跡を併用するため、いったん向きが定まれば
    // その後は地磁気にほとんど依存しない。磁気の乱れに強いのが利点。
    // ただし最初の方位は結局コンパスから取るので、絶対方位の偏りは残る。

    Function("isArkitSupported") { () -> Bool in
      SkyARSource.isSupported
    }

    Function("startArkit") {
      let source = SkyARSource.shared
      source.onFrame = { [weak self] payload in
        self?.sendEvent("onArkitAttitude", payload)
      }
      source.onFailure = { [weak self] message in
        self?.sendEvent("onArkitFailure", ["message": message])
      }
      source.start()
    }

    Function("stopArkit") {
      let source = SkyARSource.shared
      source.onFrame = nil
      source.onFailure = nil
      source.stop()
    }

    View(SkyARView.self) {}

    /// 参照フレームが真北基準かどうか。JS 側が磁気偏角を足すべきかの判断に使う。
    Function("isTrueNorthReferenced") { () -> Bool in
      self.usingTrueNorth
    }

    Function("start") {
      self.startUpdates()
    }

    Function("stop") {
      self.motionManager.stopDeviceMotionUpdates()
    }

    OnDestroy {
      self.motionManager.stopDeviceMotionUpdates()
      SkyARSource.shared.onFrame = nil
      SkyARSource.shared.onFailure = nil
      SkyARSource.shared.stop()
    }
  }

  private func startUpdates() {
    guard motionManager.isDeviceMotionAvailable, !motionManager.isDeviceMotionActive else {
      return
    }

    // 真北基準が使えるのは位置情報が有効なときだけ。使えなければ磁北基準に落ちる。
    let available = CMMotionManager.availableAttitudeReferenceFrames()
    let referenceFrame: CMAttitudeReferenceFrame
    if available.contains(.xTrueNorthZVertical) {
      referenceFrame = .xTrueNorthZVertical
      usingTrueNorth = true
    } else if available.contains(.xMagneticNorthZVertical) {
      referenceFrame = .xMagneticNorthZVertical
      usingTrueNorth = false
    } else {
      // 方位の基準が無いなら、このモジュールを使う意味がない。
      return
    }

    matrixMapsDeviceToReference = nil
    motionManager.deviceMotionUpdateInterval = updateInterval
    motionManager.startDeviceMotionUpdates(using: referenceFrame, to: queue) { [weak self] data, _ in
      guard let self, let data else { return }
      self.emit(data)
    }
  }

  private func emit(_ data: CMDeviceMotion) {
    resolveConventionIfPossible(from: data)

    // 未判定のあいだは送らない。誤った向きで一瞬でも表示するより、
    // わずかに待つほうがよい。傾ければ 1 秒とかからず決まる。
    guard let deviceToReference = matrixMapsDeviceToReference else { return }

    let q = data.attitude.quaternion
    // CMQuaternion は (x, y, z, w)。逆回転は虚部の符号を反転したもの。
    let sign = deviceToReference ? 1.0 : -1.0

    let field = data.magneticField.field
    let magnitude = (field.x * field.x + field.y * field.y + field.z * field.z).squareRoot()

    sendEvent(
      "onAttitude",
      [
        "w": q.w,
        "x": q.x * sign,
        "y": q.y * sign,
        "z": q.z * sign,
        "headingAccuracy": data.magneticField.accuracy.rawValue,
        "fieldMagnitude": magnitude,
        "trueNorth": usingTrueNorth,
      ]
    )
  }

  /// 行列の向きを重力ベクトルで判定する。判定済みならそのまま。
  private func resolveConventionIfPossible(from data: CMDeviceMotion) {
    guard matrixMapsDeviceToReference == nil else { return }

    let m = data.attitude.rotationMatrix
    let g = data.gravity

    // 端末→参照 と解釈した場合（行列をそのまま適用）
    let forward = (
      m.m11 * g.x + m.m12 * g.y + m.m13 * g.z,
      m.m21 * g.x + m.m22 * g.y + m.m23 * g.z,
      m.m31 * g.x + m.m32 * g.y + m.m33 * g.z
    )
    // 参照→端末 と解釈した場合（転置を適用）
    let inverse = (
      m.m11 * g.x + m.m21 * g.y + m.m31 * g.z,
      m.m12 * g.x + m.m22 * g.y + m.m32 * g.z,
      m.m13 * g.x + m.m23 * g.y + m.m33 * g.z
    )

    // 参照フレームでの重力は真下、すなわち (0, 0, -1)。
    let errorForward = distanceToDown(forward)
    let errorInverse = distanceToDown(inverse)

    // 端末が水平に近いと両者の差が出ない。はっきり差が出るまで待つ。
    guard abs(errorForward - errorInverse) > conventionMargin else { return }
    matrixMapsDeviceToReference = errorForward < errorInverse
  }

  private func distanceToDown(_ v: (Double, Double, Double)) -> Double {
    let dx = v.0
    let dy = v.1
    let dz = v.2 + 1.0
    return (dx * dx + dy * dy + dz * dz).squareRoot()
  }
}
