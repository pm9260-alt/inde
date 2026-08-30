import ARKit
import Foundation
import simd

/**
 ARKit のセッションをひとつだけ持ち、姿勢を配る場所。

 姿勢の取得（モジュール）とカメラ映像の表示（ビュー）が同じ ARSession を
 使う必要があるため、両方から届く場所に置いてある。

 ここでは座標系の変換を一切しない。ARKit が返す値をそのまま JavaScript へ
 渡し、軸の読み替えは src/sensors/arkitFrame.ts で行う。そちらなら
 Windows 上で単体テストできるので、軸の取り違えを実機に出す前に潰せる。
 */
final class SkyARSource: NSObject, ARSessionDelegate {
  static let shared = SkyARSource()

  let session = ARSession()

  /// 姿勢が更新されるたびに呼ばれる。モジュールが差し込む。
  var onFrame: (([String: Any]) -> Void)?
  /// セッションが失敗したときに呼ばれる。
  var onFailure: ((String) -> Void)?

  private(set) var isRunning = false
  /// 真北を基準にした整列で動いているか。位置情報が使えないときは false。
  private(set) var usingHeadingAlignment = false

  private override init() {
    super.init()
    session.delegate = self
  }

  /// この端末で ARKit のワールドトラッキングが使えるか。
  static var isSupported: Bool {
    ARWorldTrackingConfiguration.isSupported
  }

  func start() {
    guard SkyARSource.isSupported else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      let configuration = ARWorldTrackingConfiguration()
      // 星の向きを合わせるには、重力と真北の両方に整列している必要がある。
      // これには位置情報の許可が要る（Apple のドキュメントに明記）。
      configuration.worldAlignment = .gravityAndHeading
      // 平面検出も人物の分離も要らない。姿勢さえ取れればよいので全部切る。
      configuration.planeDetection = []
      configuration.environmentTexturing = .none
      configuration.isLightEstimationEnabled = false
      self.usingHeadingAlignment = true
      self.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
      self.isRunning = true
    }
  }

  func stop() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.session.pause()
      self.isRunning = false
    }
  }

  // MARK: - ARSessionDelegate

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    guard let onFrame else { return }

    // カメラ → ワールド の回転。transform の左上 3x3 が回転成分。
    let transform = frame.camera.transform
    let rotation = simd_float3x3(
      simd_make_float3(transform.columns.0),
      simd_make_float3(transform.columns.1),
      simd_make_float3(transform.columns.2)
    )
    let quaternion = simd_quatf(rotation)

    onFrame([
      // simd_quatf の real が実部、imag が虚部。
      "w": Double(quaternion.real),
      "x": Double(quaternion.imag.x),
      "y": Double(quaternion.imag.y),
      "z": Double(quaternion.imag.z),
      "trackingState": Self.describe(frame.camera.trackingState),
      "headingAligned": usingHeadingAlignment
    ])
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    isRunning = false
    onFailure?(error.localizedDescription)
  }

  func sessionWasInterrupted(_ session: ARSession) {
    onFailure?("セッションが中断されました")
  }

  /// 追跡の状態を、JavaScript 側で扱いやすい文字列にする。
  private static func describe(_ state: ARCamera.TrackingState) -> String {
    switch state {
    case .notAvailable:
      return "unavailable"
    case .limited(let reason):
      switch reason {
      case .initializing:
        return "initializing"
      case .excessiveMotion:
        return "excessiveMotion"
      case .insufficientFeatures:
        return "insufficientFeatures"
      case .relocalizing:
        return "relocalizing"
      @unknown default:
        return "limited"
      }
    case .normal:
      return "normal"
    }
  }
}
