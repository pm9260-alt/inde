# Windows での進め方

Mac は要りません。iPhone 実機での確認まで Windows だけで完結します。

---

## 1. 用意するもの

| もの | 確認方法 |
|---|---|
| Node.js 20 以上 | PowerShell で `node -v` |
| Git | `git --version` |
| iPhone | iOS 15.1 以上 |
| iPhone に **Expo Go** | App Store で「Expo Go」を入れる |
| 同じ Wi-Fi | PC と iPhone が同じネットワークにいること |

Node.js が無ければ https://nodejs.org/ の LTS 版を入れてください。

---

## 2. 動かす

PowerShell で、このフォルダの中に入って：

```powershell
npm install
npm start
```

ターミナルに QR コードが出ます。**iPhone の標準カメラアプリ**で読み取ると、
Expo Go が開いてアプリが起動します。

初回はフォント（約 15MB）の転送があるので、少し待ちます。

### QR を読んでも開かないとき

会社や学校の Wi-Fi は、端末どうしの通信を遮断していることがあります。
その場合はトンネル経由で接続してください。

```powershell
npm run start:tunnel
```

---

## 3. 最初に確認すること

起動すると、次の順に許可を求められます。

1. **カメラ** — 許可
2. **位置情報**（使用中のみ） — 許可
3. **モーションとフィッタネス** — 許可（聞かれない機種もあります）

そのあと、**端末を 8 の字に大きく数回振ってください**。iOS の地磁気センサーの
較正です。これをしないと方位が定まらず、星の位置が大きくずれます。
較正が必要なときは画面上部にその旨が出ます。

準備ができたら、外に出て空へ向けてください。

### 昼間・屋内で確かめる

外に出なくても、演出の全体をそのまま確認できます。

1. 「調整」→「デモ」→ **デモ表示: 入** → 「完了」
2. 端末を **水平より 28° 以上上へ** 向ける
3. 星が現れ、三つ星から順に灯り、星座線が引かれ、オリオン座の名前が出る
4. 名前に触れると、登場人物の枠が現れて神話が始まる
5. 端末を下げてまた上げれば、何度でも最初から見られる

季節・時刻・現在地・天候は関係ありません。地磁気が使えない屋内でも動きます。
詳しくは [docs/DEMO-AND-FIGURES.md](DEMO-AND-FIGURES.md)。

デモを切ったまま昼間に試すと、可視性の判定で星がほとんど描かれません。
実際の星表で確かめたい場合は「調整」→「空の明るさ」を **暗い空** にし、
「見えそうな星だけを描く」を **しない** にしてください。

---

## 4. コマンド一覧

| コマンド | 何をするか |
|---|---|
| `npm start` | 開発サーバーを起動（Expo Go 用の QR が出る） |
| `npm run start:tunnel` | 同上。Wi-Fi が制限されている環境向け |
| `npm test` | 天文計算・姿勢推定・データ整合性の検証（実機不要） |
| `npm run typecheck` | 型検査 |
| `npm run build:catalog` | 星表を BSC5 から作り直す |
| `npm run doctor` | Expo の構成に問題がないか点検 |

デモ表示は開発ビルドにしか入りません。公開ビルドでは `eas.json` の
production プロファイルで無効にしてあります。

`npm test` は実機なしで走ります。座標変換や星座線の定義を触ったら、まずこれを
通してください。

---

## 5. Expo Go の先へ進むとき

Expo Go で動く範囲を超えるのは、次の 2 つを入れたいときです。

- **ネイティブ姿勢モジュール**（`modules/sky-attitude`）
  CoreMotion のクォータニオンを真北基準で直接受け取る。自前の推定より
  安定します。
- **ARKit による姿勢**（将来）

どちらも Mac は不要ですが、**Apple Developer Program（年間 12,800 円前後）**
への加入が必要です。実機にインストールするための署名に要ります。

加入後の手順：

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform ios
```

ビルドはクラウドの macOS で走ります。20 分ほどで、iPhone にインストールできる
リンクが出ます。以降は `npm start` の接続先が Expo Go ではなくその
開発ビルドになります。

ネイティブモジュールが入っているビルドでは、アプリが自動的にそちらを使います
（`調整` → `いまの状態` → `姿勢の取得元` が `native` になります）。

---

## 6. App Store へ出すまでに残っている作業

MVP の範囲外として、意図的に後回しにしてあります。

- **`app.json` の `bundleIdentifier` を自分のものに変える**
  いまは `com.example.hoshimeguri`。App Store に出すには実在する ID が要ります。
- **フォントの絞り込み**
  いま日本語の全字種を含む TTF を 4 つ積んでおり、約 15MB あります。
  使用文字だけに絞れば 10 分の 1 以下になります。
  ```powershell
  pip install fonttools brotli
  pyftsubset ZenOldMincho_400Regular.ttf --unicodes=U+0020-007E,U+3000-30FF,U+4E00-9FBF --output-file=...
  ```
- **アプリ名と bundle ID の確定**、プライバシーポリシーの用意
- **スクリーンショットの撮影**（実際の夜空で撮ったものが要ります）
