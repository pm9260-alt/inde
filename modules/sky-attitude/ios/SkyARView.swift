import ARKit
import ExpoModulesCore
import SceneKit
import UIKit

/**
 ARKit のカメラ映像を表示するだけのビュー。

 ARKit を使うとき、カメラは ARSession が占有する。expo-camera の
 プレビューと同時には動かせないので、ARKit 経路のときはこちらを
 星空の下に敷く。

 SceneKit の中身は空のまま。ARSCNView は背景としてカメラ映像を
 描くので、それだけを利用している。星も星座線も、その上に重ねる
 既存の GL キャンバスが描く。
 */
public final class SkyARView: ExpoView {
  private let arView = ARSCNView()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    // 姿勢の取得と同じセッションを使う。二重に走らせない。
    arView.session = SkyARSource.shared.session
    arView.scene = SCNScene()
    arView.automaticallyUpdatesLighting = false
    arView.rendersContinuously = false
    arView.preferredFramesPerSecond = 30
    arView.translatesAutoresizingMaskIntoConstraints = false
    arView.backgroundColor = .black

    addSubview(arView)
    NSLayoutConstraint.activate([
      arView.topAnchor.constraint(equalTo: topAnchor),
      arView.bottomAnchor.constraint(equalTo: bottomAnchor),
      arView.leadingAnchor.constraint(equalTo: leadingAnchor),
      arView.trailingAnchor.constraint(equalTo: trailingAnchor)
    ])
  }
}
