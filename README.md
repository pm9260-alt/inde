# 星めぐり

夜空にかざすと、その方向にある星と星座が現れ、選ぶとその星座の神話が始まる
iPhone アプリ。

星を調べるための図鑑ではありません。**いま、ここから見えている空**を舞台に
物語を体験することが目的です。都市の空でも成立するよう、肉眼で見える見込みの
高い星だけを描きます。

---

## いまできること（MVP）

1. 現在地と現在時刻から、いま空にある星の位置を計算する
2. カメラ映像に星を重ねる
3. 5 つの星座を星座線で結ぶ — オリオン座・北斗七星・カシオペヤ座・さそり座・夏の大三角
4. 端末をその星座へ向けると名前が現れ、触れると神話が始まる
5. 神話は場面ごとに進み、語られている星が空の側で光る
6. 光害・薄明・月明かりから、見えるはずの星だけを選ぶ
7. 実際の空とのずれを、その場で詰められる

---

## 動かす

```powershell
npm install
npm start
```

QR コードを iPhone の標準カメラで読むと、Expo Go でアプリが開きます。
**Mac も Apple Developer Program も要りません。**

詳しくは **[docs/SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md)**。

初回は、外に出て端末を 8 の字に振ってください（地磁気センサーの較正）。

---

## 実機で確かめること

表示位置が実際の空と合っているかは、実機でしか判断できません。
確かめ方とずれの詰め方は **[docs/ACCURACY.md](docs/ACCURACY.md)** にあります。

いまの構成での方位精度は 3〜10° 程度。誤差のほぼすべては地磁気センサーに
由来し、天体計算側の誤差は 0.002° 未満です。

---

## 構成

| | |
|---|---|
| 土台 | Expo SDK 57 / React Native 0.86 / TypeScript |
| 天体計算 | [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT) |
| 星表 | Yale Bright Star Catalogue 第 5 版（904 星） |
| 描画 | expo-gl + 生の WebGL2 |
| 姿勢 | expo-sensors の重力と地磁気から自前で組み立て（差し替え可能） |
| 書体 | Zen Old Mincho / Zen Kaku Gothic New（SIL OFL 1.1） |

### なぜ three.js を使わないか

`expo-three` の対応 three は `^0.166` で最新版と噛み合わず、描く対象は点と線
だけなので、生の WebGL のほうが依存も画質の制御も有利でした。星の光芒は
自前のシェーダで作っています。

### なぜ expo-sensors の姿勢をそのまま使わないか

expo-sensors が返すのはオイラー角だけで、CMAttitude のオイラー角は
pitch = ±90°、つまり**端末を立てて地平線の方向を見る姿勢**で特異点を持ちます。
星座アプリはその姿勢を多用します。代わりに重力と地磁気の 2 ベクトルから
TRIAD 法で回転行列を直接組み立て、オイラー角を一切経由しません。

補正は傾きと方位で分けています。傾きは重力から速く、方位は磁気ノイズを均す
ためゆっくり。この分離が「上下だけ追従が遅い」といった症状を防ぎます。

---

## 中身

```
app/                       画面（expo-router）
  index.tsx                スカイビュー。アプリの本体
  tune.tsx                 調整。ずれを詰める
src/
  design/tokens.ts         色・文字・余白・時間。視覚の唯一の出所
  astro/                   天体計算。純粋な TypeScript で実機不要
    sky.ts                 J2000 赤道座標 → いまここの地平座標
    projection.ts          地平座標 → 画面
    visibility.ts          いま肉眼で見えるか
    math.ts                ベクトルとクォータニオン
  sensors/
    attitude.ts            姿勢推定（純粋関数）
    orientationProvider.ts 姿勢の取得口。fusion / native / arkit
  sky/                     描画と選択
  data/                    星表・星座線・神話
  ui/                      画面部品
modules/sky-attitude/      Swift モジュール（任意。dev build 用）
scripts/                   星表とアイコンの生成
docs/                      手順書
```

星の位置と姿勢の計算は、React にも実機にも依存しない純粋な TypeScript に
切り出してあります。Windows 上で `npm test` を走らせるだけで、座標変換の
正しさを検証できます。

---

## 検証

```powershell
npm test        # 190 件
npm run typecheck
```

主なもの：

- 3 地点 × 4 時刻の星の地平座標が、astronomy-engine 本体の
  `DefineStar → Equator → Horizon` という**独立した経路**と 0.002° 以内で一致する
- 天頂を 0.5° 刻みで通過しても姿勢が飛ばない（オイラー角なら破綻する領域）
- 磁気ノイズによる揺れが、生の観測の 3 分の 1 以下に収まる
- 星座線の HR 番号に打ち間違いがない（実座標で幾何的に検査）
- 大気路程・極限等級・月明かりが文献値と一致する
- 画面への投影で上下左右が反転していない

---

## 出典

| | |
|---|---|
| 星表 | Hoffleit & Warren (1991) *Yale Bright Star Catalogue, 5th Revised Ed.* |
| 星の色 | Ballesteros (2012) EPL 97, 34008 / Kim et al. (2002) |
| 大気路程 | Kasten & Young (1989) *Applied Optics* 28, 4735 |
| 肉眼極限等級 | Schaefer (1990) *PASP* 102, 212 |
| 月明かり | Krisciunas & Schaefer (1991) *PASP* 103, 1033 |
| 光害の階級 | Bortle (2001) *Sky & Telescope*, February |
| 星の固有名 | IAU Working Group on Star Names |

神話の典拠は各物語（`src/data/myths/`）に記してあります。

薄明による空の明るさだけは公表モデルではなく一次近似です。その旨は
`src/astro/visibility.ts` に明記してあります。

---

## これから

構造としてすでに用意してあり、実装だけが残っているもの：

- **ARKit による姿勢**（`worldAlignment: .gravityAndHeading`）。姿勢の取得口は
  差し替えられる形になっています
- **神話の AR 演出**。場面ごとに `figure`（登場人物・怪物）を持たせてあり、
  いまは識別子だけを保持しています
- **星座の追加**。`src/data/constellations.ts` に HR 番号で書き足すだけで、
  整合性は自動で検査されます
