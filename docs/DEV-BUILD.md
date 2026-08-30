# 開発ビルドを作って iPhone に入れる

ARKit とネイティブ姿勢モジュールは、Expo Go には入っていません。使うには
「開発ビルド（Development Build）」という自分専用のアプリを作ります。

**Mac は要りません。** ビルドはクラウドの macOS で走ります。

---

## 先に決めていただくこと

コードだけでは進められない箇所があります。ここは代わりに用意できません。

| 必要なもの | 費用 | 何のために |
|---|---|---|
| **Apple Developer Program** への加入 | **有料・年額**（金額は下記ページで確認してください） | 自分の iPhone にアプリを入れるための署名に必要です |
| **Apple ID**（上記に紐づくもの） | — | ビルド時にログインを求められます。2 ファクタ認証のコード入力もあります |
| **Expo アカウント** | 無料 | ビルドをクラウドで走らせるため |

- Apple Developer Program: https://developer.apple.com/jp/programs/

**加入しない場合**、ARKit と native 経路は使えません。fusion 経路（Expo Go で
動く自前の姿勢推定）だけになります。その場合でも屋外での確認は可能ですが、
このフェーズの目的である「経路ごとの精度比較」はできません。

加入するかどうかを決めてから、以下に進んでください。

---

## 手順

### 1. ツールを入れる（Windows・初回のみ）

PowerShell で:

```powershell
npm install -g eas-cli
```

### 2. Expo にログインする

```powershell
eas login
```

Expo アカウントが無ければ https://expo.dev/signup で作ってからログインします。

### 3. アプリの ID を自分のものにする

`app.json` の 2 か所を、世界で重複しない文字列に変えます。いまは仮の値です。

```json
"ios":     { "bundleIdentifier": "com.example.hoshimeguri" },
"android": { "package":          "com.example.hoshimeguri" }
```

`com.` のあとを自分の名前やドメインに置き換えてください（例:
`com.yourname.hoshimeguri`）。**2 か所とも同じ文字列**にします。

### 4. ビルドの設定を作る（初回のみ）

```powershell
eas build:configure
```

「Which platforms?」と聞かれたら **iOS** を選びます。

### 5. iPhone を登録する

```powershell
eas device:create
```

- 「How would you like to register your devices?」→ **Website** を選ぶ
- URL と QR コードが出ます。**iPhone の標準カメラ**で QR を読み、
  表示されるプロファイルをインストールしてください
  （設定アプリに「プロファイルがダウンロードされました」と出たら、
  設定 → 一般 → VPN とデバイス管理 から入れます）
- 終わったら PowerShell に戻って Enter

ここで Apple ID のログインを求められます。2 ファクタ認証のコードも入力します。

### 6. ビルドする

```powershell
eas build --profile development --platform ios
```

- Apple ID を聞かれたらログイン
- 「Generate a new Apple Distribution Certificate?」→ **Yes**
- 「Generate a new Apple Provisioning Profile?」→ **Yes**

そのあと **15〜30 分**待ちます。終わると URL が出ます。

### 7. iPhone に入れる

出てきた URL を iPhone で開き、「Install」を押します。ホーム画面に
「星めぐり」が入ります。

初回起動時に「信頼されていないデベロッパ」と出たら、
設定 → 一般 → VPN とデバイス管理 → 自分の Apple ID → 「信頼」。

### 8. つなぐ

```powershell
npm start
```

QR を **iPhone の標準カメラ**で読むと、Expo Go ではなく先ほど入れた
「星めぐり」が開きます。以降、コードを直すとその場で反映されます。
ビルドをやり直す必要があるのは、ネイティブのコード（`modules/` の中）を
変えたときだけです。

---

## 最初のビルドで失敗したときの連絡のしかた

このプロジェクトの Swift（`modules/sky-attitude/ios/`）は、Windows 上でも
このセッションでも**コンパイルして確かめられません**。Xcode が要るためです。
型の検査もテストも通していますが、Swift だけは実際にビルドするまで
分かりません。最初のビルドで止まる可能性があります。

止まった場合は、次を伝えてください。すぐ直せます。

1. PowerShell に出ている **最後の 30 行ほど**
2. EAS が出す **ビルドログの URL**（`https://expo.dev/accounts/.../builds/...`）
   のうち、`error:` を含む行

---

## 入ったあとに確認すること

1. アプリを開き、右上の **「調整」** → いちばん下の **「精度を確かめる」**
2. 「姿勢の取得経路」に **ARKit** と **native** が出ていることを確認
   - 出ていなければ、開発ビルドではなく Expo Go につながっています
3. **ARKit** を選ぶ
   - 「座標系の検算」が **1° 未満** なら、軸の読み替えは正しく動いています
   - **10° を超えている** なら軸の取り違えです。その数値を教えてください
4. 位置情報の許可を出しておいてください。ARKit の真北への整列には
   位置情報が要ります（Apple のドキュメントに明記されています）

そのあとの精度の詰め方は [ACCURACY.md](ACCURACY.md) にあります。

---

## 公開ビルドとの違い

開発ビルドには、デモ表示と精度確認画面が入ります。公開ビルド
（`--profile production`）では `eas.json` の設定で両方とも外れます。
