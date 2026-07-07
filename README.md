<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>World Cup Archive 1994-2022</title>
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- React & ReactDOM -->
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  
  <!-- Babel (JSXコンパイル用) -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">
    const { useState } = React;

    // ---------------- データ ----------------
    const DATA = [
      {
        year: 1994, host: "アメリカ",
        mvp: { name: "ロマーリオ", flag: "🇧🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%83%AD%E3%83%9E%E3%83%BC%E3%83%AA%E3%82%AA" },
        japan: { label: "出場ならず", detail: "最終予選で敗退（ドーハの悲劇）", out: true },
        teams: [
          { rank: "優勝", flag: "🇧🇷", name: "ブラジル", note: "24年ぶり4回目の優勝", match: { stage: "決勝", opp: "イタリア", score: "0-0 (PK 3-2)", win: true },
            xi: [["タファレル"], ["ジョルジーニョ", "アウダイール", "M・サントス", "ブランコ"], ["マジーニョ", "ドゥンガ", "マウロ・シウバ", "ジーニョ"], ["ベベット", "ロマーリオ"]] },
          { rank: "準優勝", flag: "🇮🇹", name: "イタリア", note: "24年ぶり2回目の準優勝", match: { stage: "決勝", opp: "ブラジル", score: "0-0 (PK 2-3)", win: false },
            xi: [["パリューカ"], ["ムッシ", "バレージ", "マルディーニ", "ベナリーボ"], ["ベルティ", "D・バッジョ", "アルベルティーニ", "ドナドーニ"], ["R・バッジョ", "マッサーロ"]] },
          { rank: "3位", flag: "🇸🇪", name: "スウェーデン", note: "36年ぶり4回目のベスト4", match: { stage: "3位決定戦", opp: "ブルガリア", score: "4-0", win: true },
            xi: [["ラヴェッリ"], ["R・ニルソン", "P・アンデション", "ビョルクルンド", "カーマルク"], ["ブローリン", "ミルド", "シュヴァルツ", "インゲソン"], ["ラーション", "K・アンデション"]] },
          { rank: "4位", flag: "🇧🇬", name: "ブルガリア", note: "史上初のベスト4", match: { stage: "3位決定戦", opp: "スウェーデン", score: "0-4", win: false },
            xi: [["ミハイロフ"], ["キリャコフ", "イヴァノフ", "フブチェフ", "ツヴェタノフ"], ["ヤンコフ", "レチコフ", "バラコフ", "シラコフ"], ["コスタディノフ", "ストイチコフ"]] },
        ],
      },
      {
        year: 1998, host: "フランス",
        mvp: { name: "ロナウド", flag: "🇧🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%83%AD%E3%83%8A%E3%82%A6%E3%83%89" },
        japan: { label: "グループリーグ敗退", detail: "初出場・3戦全敗（最終順位31位）", out: false,
          match: { stage: "GL第3戦", opp: "ジャマイカ", score: "1-2", win: false },
          xi: [["川口能活"], ["秋田豊", "井原正巳", "中西永輔"], ["名良橋晃", "山口素弘", "名波浩", "中田英寿", "相馬直樹"], ["中山雅史", "城彰二"]] },
        teams: [
          { rank: "優勝", flag: "🇫🇷", name: "フランス", note: "自国開催で悲願の初優勝", match: { stage: "決勝", opp: "ブラジル", score: "3-0", win: true },
            xi: [["バルテズ"], ["テュラム", "ルブフ", "デサイー", "リザラズ"], ["カランブー", "デシャン", "プティ"], ["ジョルカエフ", "ジダン"], ["ギヴァルシュ"]] },
          { rank: "準優勝", flag: "🇧🇷", name: "ブラジル", note: "48年ぶり2回目の準優勝", match: { stage: "決勝", opp: "フランス", score: "0-3", win: false },
            xi: [["タファレル"], ["カフー", "J・バイアーノ", "アウダイール", "R・カルロス"], ["C・サンパイオ", "ドゥンガ"], ["レオナルド", "リバウド"], ["ベベット", "ロナウド"]] },
          { rank: "3位", flag: "🇭🇷", name: "クロアチア", note: "初出場でいきなりベスト4（3位）", match: { stage: "3位決定戦", opp: "オランダ", score: "2-1", win: true },
            xi: [["ラディッチ"], ["シミッチ", "ビリッチ", "シュティマツ", "ヤルニ"], ["スタニッチ", "ソルド", "アサノヴィッチ", "プロシネチキ"], ["シュケル", "ヴラオヴィッチ"]] },
          { rank: "4位", flag: "🇳🇱", name: "オランダ", note: "20年ぶり3回目のベスト4", match: { stage: "3位決定戦", opp: "クロアチア", score: "1-2", win: false },
            xi: [["ファン・デル・サール"], ["レイジハー", "スタム", "F・デ・ブール", "ヌマン"], ["ゼンデン", "ダーヴィッツ", "セードルフ", "R・デ・ブール"], ["クライファート", "ファン・ホーイドンク"]] },
        ],
      },
      {
        year: 2002, host: "日本／韓国",
        mvp: { name: "オリバー・カーン", flag: "🇩🇪", wiki: "https://ja.wikipedia.org/wiki/%E3%82%AA%E3%83%AA%E3%83%90%E3%83%BC%E3%83%BB%E3%82%AB%E3%83%BC%E3%83%B3" },
        japan: { label: "ベスト16", detail: "自国開催で初の決勝T進出（最終順位9位）", out: false,
          match: { stage: "ラウンド16", opp: "トルコ", score: "0-1", win: false },
          xi: [["楢崎正剛"], ["松田直樹", "宮本恒靖", "中田浩二"], ["明神智和", "戸田和幸", "小野伸二"], ["稲本潤一", "中田英寿", "三都主"], ["西澤明訓"]] },
        teams: [
          { rank: "優勝", flag: "🇧🇷", name: "ブラジル", note: "8年ぶり最多5回目の優勝", match: { stage: "決勝", opp: "ドイツ", score: "2-0", win: true },
            xi: [["マルコス"], ["ルシオ", "エジミウソン", "R・ジュニオール"], ["カフー", "G・シウバ", "クレベルソン", "R・カルロス"], ["リバウド", "ロナウジーニョ"], ["ロナウド"]] },
          { rank: "準優勝", flag: "🇩🇪", name: "ドイツ", note: "16年ぶり4回目の準優勝（西独時代含む）", match: { stage: "決勝", opp: "ブラジル", score: "0-2", win: false },
            xi: [["カーン"], ["リンケ", "ラメロウ", "メッツェルダー"], ["フリンクス", "イェレミース", "ハーマン", "ボーデ"], ["シュナイダー"], ["クローゼ", "ノイヴィル"]] },
          { rank: "3位", flag: "🇹🇷", name: "トルコ", note: "史上初のベスト4（3位）", match: { stage: "3位決定戦", opp: "韓国", score: "3-2", win: true },
            xi: [["リュシュテュ"], ["F・アキエル", "ビュレント", "アルパイ", "エルギュン"], ["トゥガイ", "エムレ", "バシュテュルク", "H・シャシュ"], ["マンスズ", "H・シュキュル"]] },
          { rank: "4位", flag: "🇰🇷", name: "韓国", note: "アジア勢史上初のベスト4", match: { stage: "3位決定戦", opp: "トルコ", score: "2-3", win: false },
            xi: [["イ・ウンジェ"], ["チェ・ジンチョル", "ホン・ミョンボ", "イ・ミンソン"], ["ソン・ジョングク", "パク・チソン", "ユ・サンチョル", "イ・ヨンピョ"], ["イ・チョンス", "アン・ジョンファン", "ソル・ギヒョン"]] },
        ],
      },
      {
        year: 2006, host: "ドイツ",
        mvp: { name: "ジネディーヌ・ジダン", flag: "🇫🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%82%B8%E3%83%8D%E3%83%87%E3%82%A3%E3%83%BC%E3%83%8C%E3%83%BB%E3%82%B8%E3%83%80%E3%83%B3" },
        japan: { label: "グループリーグ敗退", detail: "1分2敗（最終順位28位）", out: false,
          match: { stage: "GL第3戦", opp: "ブラジル", score: "1-4", win: false },
          xi: [["川口能活"], ["加地亮", "中澤佑二", "宮本恒靖", "三都主"], ["中田英寿", "稲本潤一", "小笠原満男", "中村俊輔"], ["巻誠一郎", "玉田圭司"]] },
        teams: [
          { rank: "優勝", flag: "🇮🇹", name: "イタリア", note: "24年ぶり4回目の優勝", match: { stage: "決勝", opp: "フランス", score: "1-1 (PK 5-3)", win: true },
            xi: [["ブッフォン"], ["ザンブロッタ", "カンナバーロ", "マテラッツィ", "グロッソ"], ["ガットゥーゾ", "ピルロ", "カモラネージ", "ペロッタ"], ["トッティ"], ["トーニ"]] },
          { rank: "準優勝", flag: "🇫🇷", name: "フランス", note: "初の準優勝", match: { stage: "決勝", opp: "イタリア", score: "1-1 (PK 3-5)", win: false },
            xi: [["バルテズ"], ["サニョル", "テュラム", "ギャラス", "アビダル"], ["ビエラ", "マケレレ"], ["リベリー", "ジダン", "マルダ"], ["アンリ"]] },
          { rank: "3位", flag: "🇩🇪", name: "ドイツ", note: "36年ぶり3回目の3位（ベスト4は通算11回目）", match: { stage: "3位決定戦", opp: "ポルトガル", score: "3-1", win: true },
            xi: [["カーン"], ["フリードリヒ", "メルテザッカー", "ノヴォトニー", "ヤンゼン"], ["シュヴァインシュタイガー", "ケール", "ボロウスキ"], ["シュナイダー", "ポドルスキ"], ["クローゼ"]] },
          { rank: "4位", flag: "🇵🇹", name: "ポルトガル", note: "40年ぶり2回目のベスト4", match: { stage: "3位決定戦", opp: "ドイツ", score: "1-3", win: false },
            xi: [["リカルド"], ["ミゲル", "フェレイラ", "R・カルヴァーリョ", "N・ヴァレンテ"], ["プチ", "マニシェ"], ["フィーゴ", "デコ", "C・ロナウド"], ["パウレタ"]] },
        ],
      },
      {
        year: 2010, host: "南アフリカ",
        mvp: { name: "ディエゴ・フォルラン", flag: "🇺🇾", wiki: "https://ja.wikipedia.org/wiki/%E3%83%87%E3%82%A3%E3%82%A8%E3%82%B4%E3%83%BB%E3%83%95%E3%82%A9%E3%83%AB%E3%83%A9%E3%83%B3" },
        japan: { label: "ベスト16", detail: "パラグアイにPK戦で敗退（最終順位9位）", out: false,
          match: { stage: "ラウンド16", opp: "パラグアイ", score: "0-0 (PK 3-5)", win: false },
          xi: [["川島永嗣"], ["駒野友一", "中澤佑二", "闘莉王", "長友佑都"], ["阿部勇樹"], ["長谷部誠", "遠藤保仁"], ["松井大輔", "本田圭佑", "大久保嘉人"]] },
        teams: [
          { rank: "優勝", flag: "🇪🇸", name: "スペイン", note: "悲願の初優勝", match: { stage: "決勝", opp: "オランダ", score: "1-0 (延長)", win: true },
            xi: [["カシージャス"], ["S・ラモス", "ピケ", "プジョル", "カプデビラ"], ["ブスケツ", "シャビ・アロンソ"], ["ペドロ", "シャビ", "イニエスタ"], ["ビジャ"]] },
          { rank: "準優勝", flag: "🇳🇱", name: "オランダ", note: "32年ぶり3回目の準優勝（無冠の帝王）", match: { stage: "決勝", opp: "スペイン", score: "0-1 (延長)", win: false },
            xi: [["ステケレンブルフ"], ["ファン・デル・ヴィール", "ヘイティンガ", "マタイセン", "ファン・ブロンクホルスト"], ["ファン・ボメル", "デ・ヨング"], ["ロッベン", "スナイデル", "カイト"], ["ファン・ペルシー"]] },
          { rank: "3位", flag: "🇩🇪", name: "ドイツ", note: "2大会連続の3位", match: { stage: "3位決定戦", opp: "ウルグアイ", score: "3-2", win: true },
            xi: [["ブット"], ["ボアテング", "フリードリヒ", "メルテザッカー", "アオゴ"], ["シュヴァインシュタイガー", "ケディラ"], ["ミュラー", "エジル", "ヤンゼン"], ["カカウ"]] },
          { rank: "4位", flag: "🇺🇾", name: "ウルグアイ", note: "40年ぶり5回目のベスト4", match: { stage: "3位決定戦", opp: "ドイツ", score: "2-3", win: false },
            xi: [["ムスレラ"], ["M・ペレイラ", "ビクトリーノ", "カセレス", "フシーレ"], ["アレバロ", "ペレス", "A・ペレイラ"], ["フォルラン", "スアレス", "カバーニ"]] },
        ],
      },
      {
        year: 2014, host: "ブラジル",
        mvp: { name: "リオネル・メッシ", flag: "🇦🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%83%AA%E3%82%AA%E3%83%8D%E3%83%AB%E3%83%BB%E3%83%A1%E3%83%83%E3%82%B7" },
        japan: { label: "グループリーグ敗退", detail: "1分2敗（最終順位29位）", out: false,
          match: { stage: "GL第3戦", opp: "コロンビア", score: "1-4", win: false },
          xi: [["川島永嗣"], ["内田篤人", "吉田麻也", "今野泰幸", "長友佑都"], ["山口蛍", "青山敏弘"], ["岡崎慎司", "本田圭佑", "香川真司"], ["大久保嘉人"]] },
        teams: [
          { rank: "優勝", flag: "🇩🇪", name: "ドイツ", note: "24年ぶり4回目の優勝（南米開催で欧州勢初V）", match: { stage: "決勝", opp: "アルゼンチン", score: "1-0 (延長)", win: true },
            xi: [["ノイアー"], ["ラーム", "ボアテング", "フンメルス", "ヘヴェデス"], ["シュヴァインシュタイガー", "クロース"], ["ミュラー", "クラマー", "エジル"], ["クローゼ"]] },
          { rank: "準優勝", flag: "🇦🇷", name: "アルゼンチン", note: "24年ぶり3回目の準優勝", match: { stage: "決勝", opp: "ドイツ", score: "0-1 (延長)", win: false },
            xi: [["ロメロ"], ["サバレタ", "デミチェリス", "ガライ", "ロホ"], ["ペレス", "マスチェラーノ", "ビリア"], ["メッシ", "ラベッシ"], ["イグアイン"]] },
          { rank: "3位", flag: "🇳🇱", name: "オランダ", note: "2大会連続5回目のベスト4（3位は初）", match: { stage: "3位決定戦", opp: "ブラジル", score: "3-0", win: true },
            xi: [["シレッセン"], ["デ・フライ", "フラール", "M・インディ"], ["カイト", "ワイナルドゥム", "クラーシ", "ブリント"], ["ロッベン", "ファン・ペルシー", "デパイ"]] },
          { rank: "4位", flag: "🇧🇷", name: "ブラジル", note: "自国開催・12年ぶりのベスト4（準決勝1-7の惨敗）", match: { stage: "3位決定戦", opp: "オランダ", score: "0-3", win: false },
            xi: [["ジュリオ・セザール"], ["マイコン", "チアゴ・シウバ", "ダビド・ルイス", "マクスウェル"], ["L・グスタボ", "パウリーニョ"], ["ウィリアン", "オスカル", "ラミレス"], ["ジョー"]] },
        ],
      },
      {
        year: 2018, host: "ロシア",
        mvp: { name: "ルカ・モドリッチ", flag: "🇭🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%83%AB%E3%82%AB%E3%83%BB%E3%83%A2%E3%83%89%E3%83%AA%E3%83%83%E3%83%81" },
        japan: { label: "ベスト16", detail: "ベルギーに2-3で逆転負け・ロストフの悲劇（最終順位15位）", out: false,
          match: { stage: "ラウンド16", opp: "ベルギー", score: "2-3", win: false },
          xi: [["川島永嗣"], ["酒井宏樹", "吉田麻也", "昌子源", "長友佑都"], ["柴崎岳", "長谷部誠"], ["原口元気", "香川真司", "乾貴士"], ["大迫勇也"]] },
        teams: [
          { rank: "優勝", flag: "🇫🇷", name: "フランス", note: "20年ぶり2回目の優勝", match: { stage: "決勝", opp: "クロアチア", score: "4-2", win: true },
            xi: [["ロリス"], ["パバール", "バラン", "ウンティティ", "L・エルナンデス"], ["ポグバ", "カンテ"], ["エムバペ", "グリーズマン", "マテュイディ"], ["ジルー"]] },
          { rank: "準優勝", flag: "🇭🇷", name: "クロアチア", note: "史上初の決勝進出（準優勝）", match: { stage: "決勝", opp: "フランス", score: "2-4", win: false },
            xi: [["スバシッチ"], ["ヴルサリコ", "ロヴレン", "ヴィダ", "ストリニッチ"], ["ラキティッチ", "ブロゾヴィッチ"], ["レビッチ", "モドリッチ", "ペリシッチ"], ["マンジュキッチ"]] },
          { rank: "3位", flag: "🇧🇪", name: "ベルギー", note: "32年ぶり2回目のベスト4・3位は過去最高成績", match: { stage: "3位決定戦", opp: "イングランド", score: "2-0", win: true },
            xi: [["クルトワ"], ["アルデルヴァイレルト", "コンパニ", "フェルトンゲン"], ["ムニエ", "ヴィツェル", "デ・ブライネ", "シャドリ"], ["メルテンス", "E・アザール"], ["ルカク"]] },
          { rank: "4位", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "イングランド", note: "28年ぶり3回目のベスト4", match: { stage: "3位決定戦", opp: "ベルギー", score: "0-2", win: false },
            xi: [["ピックフォード"], ["ジョーンズ", "ストーンズ", "マグワイア"], ["トリッピアー", "ロフタス=チーク", "ダイアー", "ローズ"], ["リンガード"], ["ケイン", "スターリング"]] },
        ],
      },
      {
        year: 2022, host: "カタール",
        mvp: { name: "リオネル・メッシ", flag: "🇦🇷", wiki: "https://ja.wikipedia.org/wiki/%E3%83%AA%E3%82%AA%E3%83%8D%E3%83%AB%E3%83%BB%E3%83%A1%E3%83%83%E3%82%B7" },
        japan: { label: "ベスト16", detail: "独・西を撃破し首位通過→クロアチアにPK戦で敗退（最終順位9位）", out: false,
          match: { stage: "ラウンド16", opp: "クロアチア", score: "1-1 (PK 1-3)", win: false },
          xi: [["権田修一"], ["谷口彰悟", "吉田麻也", "冨安健洋"], ["伊東純也", "遠藤航", "守田英正", "長友佑都"], ["堂安律", "鎌田大地"], ["前田大然"]] },
        teams: [
          { rank: "優勝", flag: "🇦🇷", name: "アルゼンチン", note: "36年ぶり3回目の優勝", match: { stage: "決勝", opp: "フランス", score: "3-3 (PK 4-2)", win: true },
            xi: [["E・マルティネス"], ["モリーナ", "ロメロ", "オタメンディ", "タグリアフィコ"], ["デ・パウル", "E・フェルナンデス", "マック・アリスター"], ["メッシ", "ディ・マリア"], ["J・アルバレス"]] },
          { rank: "準優勝", flag: "🇫🇷", name: "フランス", note: "16年ぶり2回目の準優勝（連覇にあと一歩）", match: { stage: "決勝", opp: "アルゼンチン", score: "3-3 (PK 2-4)", win: false },
            xi: [["ロリス"], ["クンデ", "バラン", "ウパメカノ", "T・エルナンデス"], ["チュアメニ", "ラビオ"], ["デンベレ", "グリーズマン", "エムバペ"], ["ジルー"]] },
          { rank: "3位", flag: "🇭🇷", name: "クロアチア", note: "2大会連続3回目のベスト4・24年ぶり2回目の3位", match: { stage: "3位決定戦", opp: "モロッコ", score: "2-1", win: true },
            xi: [["リヴァコヴィッチ"], ["スタニシッチ", "シュタロ", "グヴァルディオル", "ペリシッチ"], ["モドリッチ", "コヴァチッチ", "マイェル"], ["オルシッチ", "リヴァヤ", "クラマリッチ"]] },
          { rank: "4位", flag: "🇲🇦", name: "モロッコ", note: "アフリカ勢史上初のベスト4", match: { stage: "3位決定戦", opp: "クロアチア", score: "1-2", win: false },
            xi: [["ブヌ"], ["ハキミ", "エル・ヤミク", "ダリ", "アティヤト・アッラー"], ["アムラバト", "エル・カンヌス"], ["ジエシュ", "サビリ", "ブファル"], ["エン=ネシリ"]] },
        ],
      },
    ];

    // 展開部（クリーム背景）用と閉じた状態用の順位カラー
    const RANK_STYLE = {
      "優勝":   { color: "#A8821F", star: "★" },
      "準優勝": { color: "#6E7B87", star: "" },
      "3位":    { color: "#96632F", star: "" },
      "4位":    { color: "#5F6B64", star: "" },
    };
    const FLAG_SIZE = ["text-3xl", "text-2xl", "text-xl", "text-base"];

    // ---------------- W杯通算成績（1930–2022） ----------------
    const ALL_TIME = [
      { flag: "🇧🇷", name: "ブラジル", w: 5, ru: 2, b4: 11 },
      { flag: "🇩🇪", name: "ドイツ", w: 4, ru: 4, b4: 13 },
      { flag: "🇮🇹", name: "イタリア", w: 4, ru: 2, b4: 8 },
      { flag: "🇦🇷", name: "アルゼンチン", w: 3, ru: 3, b4: 6 },
      { flag: "🇫🇷", name: "フランス", w: 2, ru: 2, b4: 7 },
      { flag: "🇺🇾", name: "ウルグアイ", w: 2, ru: 0, b4: 5 },
      { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "イングランド", w: 1, ru: 0, b4: 3 },
      { flag: "🇪🇸", name: "スペイン", w: 1, ru: 0, b4: 2 },
      { flag: "🇳🇱", name: "オランダ", w: 0, ru: 3, b4: 5 },
      { flag: "🇭🇺", name: "ハンガリー", w: 0, ru: 2, b4: 2 },
      { flag: "🇨🇿", name: "チェコスロバキア", w: 0, ru: 2, b4: 2 },
      { flag: "🇸🇪", name: "スウェーデン", w: 0, ru: 1, b4: 4 },
      { flag: "🇭🇷", name: "クロアチア", w: 0, ru: 1, b4: 3 },
      { flag: "🇵🇱", name: "ポーランド", w: 0, ru: 0, b4: 2 },
      { flag: "🇦🇹", name: "オーストリア", w: 0, ru: 0, b4: 2 },
      { flag: "🇧🇪", name: "ベルギー", w: 0, ru: 0, b4: 2 },
      { flag: "🇵🇹", name: "ポルトガル", w: 0, ru: 0, b4: 2 },
      { flag: "＊", name: "ユーゴスラビア", w: 0, ru: 0, b4: 2 },
      { flag: "🇺🇸", name: "アメリカ", w: 0, ru: 0, b4: 1 },
      { flag: "🇨🇱", name: "チリ", w: 0, ru: 0, b4: 1 },
      { flag: "＊", name: "ソ連", w: 0, ru: 0, b4: 1 },
      { flag: "🇧🇬", name: "ブルガリア", w: 0, ru: 0, b4: 1 },
      { flag: "🇹🇷", name: "トルコ", w: 0, ru: 0, b4: 1 },
      { flag: "🇰🇷", name: "韓国", w: 0, ru: 0, b4: 1 },
      { flag: "🇲🇦", name: "モロッコ", w: 0, ru: 0, b4: 1 },
    ];

    // ---------------- 地図データ ----------------
    // 世界地図（登場国すべて／欧州は代表点のみ、詳細は欧州拡大図へ）
    const MAP_WORLD = [
      { flag: "🇺🇸", name: "アメリカ", x: 80, y: 51 },
      { flag: "🇧🇷", name: "ブラジル", x: 128, y: 100 },
      { flag: "🇦🇷", name: "アルゼンチン", x: 114, y: 125 },
      { flag: "🇺🇾", name: "ウルグアイ", x: 126, y: 122 },
      { flag: "🇲🇦", name: "モロッコ", x: 173, y: 58 },
      { flag: "🇷🇺", name: "ロシア", x: 235, y: 33 },
      { flag: "🇿🇦", name: "南アフリカ", x: 205, y: 119 },
      { flag: "🇶🇦", name: "カタール", x: 231, y: 65 },
      { flag: "🇰🇷", name: "韓国", x: 307, y: 53.5 },
      { flag: "🇯🇵", name: "日本", x: 319, y: 54 },
    ];
    // 欧州拡大図（経度-12〜42、緯度34〜62）
    const MAP_EUROPE = [
      { flag: "🇵🇹", name: "ポルトガル", x: 21, y: 145 },
      { flag: "🇪🇸", name: "スペイン", x: 47, y: 141 },
      { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "イングランド", x: 62, y: 61 },
      { flag: "🇫🇷", name: "フランス", x: 83, y: 100 },
      { flag: "🇧🇪", name: "ベルギー", x: 98, y: 73 },
      { flag: "🇳🇱", name: "オランダ", x: 104, y: 60 },
      { flag: "🇩🇪", name: "ドイツ", x: 130, y: 71 },
      { flag: "🇮🇹", name: "イタリア", x: 145, y: 125 },
      { flag: "🇸🇪", name: "スウェーデン", x: 163, y: 20 },
      { flag: "🇭🇷", name: "クロアチア", x: 166, y: 107 },
      { flag: "🇧🇬", name: "ブルガリア", x: 219, y: 122 },
      { flag: "🇹🇷", name: "トルコ", x: 267, y: 145 },
      { flag: "🇷🇺", name: "ロシア(西部)", x: 294, y: 41 },
    ];

    function MapPanel({ title, note, countries, viewBox, silhouettes, flagSize = 9 }) {
      const [sel, setSel] = useState(null);
      const selC = countries.find((c) => c.name === sel);
      return (
        <div className="rounded-xl p-3" style={{ background: "#132A1C", border: "1px solid #24422F" }}>
          <p className="text-[10px] tracking-[0.3em] mb-2" style={{ color: "#8FA396" }}>{title}</p>
          <svg viewBox={viewBox} className="w-full rounded-lg" style={{ background: "#0E2418" }}>
            <g fill="#E9E6D8" opacity="0.13">{silhouettes}</g>
            {countries.map((c) => {
              const active = sel === c.name;
              return (
                <g key={c.name} onClick={() => setSel(active ? null : c.name)} style={{ cursor: "pointer" }}>
                  {active && <circle cx={c.x} cy={c.y} r={flagSize + 2} fill="none" stroke="#E4C05C" strokeWidth="1.5" />}
                  <text x={c.x} y={c.y + flagSize * 0.38} textAnchor="middle" fontSize={active ? flagSize + 4 : flagSize}>{c.flag}</text>
                </g>
              );
            })}
            {selC && (
              <text x={selC.x} y={selC.y - flagSize - 4} textAnchor="middle" fontSize={flagSize + 1} fill="#E4C05C"
                style={{ fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 700, paintOrder: "stroke", stroke: "#0B1F14", strokeWidth: 3 }}>
                {selC.name}
              </text>
            )}
          </svg>
          <p className="text-[11px] mt-2 text-center" style={{ color: sel ? "#E4C05C" : "#5F7368" }}>
            {sel ? `${selC.flag} ${sel}` : note}
          </p>
        </div>
      );
    }

    const WORLD_SILHOUETTES = (
      <>
        <path d="M20 22 L55 14 L98 20 L118 32 L112 50 L96 52 L90 68 L80 58 L58 52 L34 44 Z" />
        <path d="M116 86 L134 80 L144 92 L138 112 L126 142 L117 114 Z" />
        <path d="M186 16 L200 12 L204 26 L193 31 Z" />
        <path d="M168 40 L179 30 L198 27 L212 34 L214 45 L203 51 L187 53 L173 49 Z" />
        <path d="M172 56 L202 52 L214 62 L215 78 L204 100 L193 122 L185 98 L173 74 Z" />
        <path d="M215 42 L240 22 L300 15 L338 27 L345 44 L322 52 L306 64 L288 58 L268 72 L256 56 L234 52 L219 48 Z" />
        <path d="M315 48 L323 44 L327 55 L318 60 Z" />
        <path d="M290 118 L318 113 L327 128 L301 134 Z" />
      </>
    );
    
    const EUROPE_SILHOUETTES = (
      <>
        {/* ブリテン島 */}
        <path d="M48 30 L66 22 L74 48 L60 72 L46 58 Z" />
        {/* イベリア半島 */}
        <path d="M12 128 L58 120 L68 142 L40 164 L14 150 Z" />
        {/* スカンジナビア */}
        <path d="M140 0 L184 0 L188 32 L160 46 L144 22 Z" />
        {/* 欧州大陸 */}
        <path d="M62 86 L104 56 L200 30 L312 26 L320 60 L320 180 L244 180 L204 152 L172 132 L152 134 L122 118 L72 112 Z" />
        {/* イタリア半島 */}
        <path d="M138 116 L152 120 L168 152 L158 162 L144 136 Z" />
      </>
    );

    // ---------------- ピッチ（イレブン表示） ----------------
    function Pitch({ xi, color }) {
      const W = 320, H = 400;
      const rows = xi.length;
      return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }}>
          <rect x="0" y="0" width={W} height={H} rx="10" fill="#12331F" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="0" y={(H / 5) * i} width={W} height={H / 10} fill="#16381F" opacity="0.7" />
          ))}
          <g stroke="#E9E6D8" strokeWidth="1.4" opacity="0.55" fill="none">
            <rect x="12" y="12" width={W - 24} height={H - 24} rx="4" />
            <line x1="12" y1={H / 2} x2={W - 12} y2={H / 2} />
            <circle cx={W / 2} cy={H / 2} r="34" />
            <rect x={W / 2 - 70} y={H - 60} width="140" height="48" />
            <rect x={W / 2 - 70} y="12" width="140" height="48" />
          </g>
          {xi.map((line, ri) => {
            const y = H - 44 - (ri * (H - 96)) / Math.max(rows - 1, 1);
            return line.map((p, pi) => {
              const x = (W / (line.length + 1)) * (pi + 1);
              return (
                <g key={`${ri}-${pi}`}>
                  <circle cx={x} cy={y} r="13" fill={ri === 0 ? "#E9E6D8" : color} opacity="0.95" />
                  <circle cx={x} cy={y} r="13" fill="none" stroke="#0B1F14" strokeWidth="1.5" />
                  <text x={x} y={y + 26} textAnchor="middle" fontSize="9.5" fill="#E9E6D8"
                    style={{ fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 500, paintOrder: "stroke", stroke: "#0B1F14", strokeWidth: 2.5 }}>
                    {p}
                  </text>
                </g>
              );
            });
          })}
        </svg>
      );
    }

    // ---------------- メイン ----------------
    function WorldCupArchive() {
      const [openYear, setOpenYear] = useState(null);
      const [teamName, setTeamName] = useState(null);

      const toggleYear = (y) => {
        setTeamName(null);
        setOpenYear(openYear === y ? null : y);
      };

      return (
        <div className="min-h-screen" style={{ background: "#0B1F14", color: "#E9E6D8", fontFamily: "'Noto Sans JP', sans-serif" }}>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Anton&family=Noto+Sans+JP:wght@400;500;700&family=Shippori+Mincho+B1:wght@700;800&display=swap');
            .anton { font-family: 'Anton', sans-serif; letter-spacing: 0.02em; }
            .mincho { font-family: 'Shippori Mincho B1', serif; }
            @keyframes riseIn { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            .rise { animation: riseIn .22s ease-out; }
            @media (prefers-reduced-motion: reduce) { .rise { animation: none; } }
          `}</style>

          <header className="px-5 pt-6 pb-4">
            <p className="text-[11px] tracking-[0.35em]" style={{ color: "#8FA396" }}>WORLD CUP ARCHIVE</p>
            <h1 className="mincho text-[32px] font-extrabold mt-1 leading-tight" style={{ letterSpacing: "0.06em" }}>
              栄光のベスト4
              <span className="anton block text-xl mt-0.5" style={{ color: "#E4C05C", letterSpacing: "0.12em" }}>1994 – 2022</span>
            </h1>
            <p className="text-[11px] mt-2" style={{ color: "#8FA396" }}>年をタップ → 国をタップでイレブン表示（国旗は順位が高いほど大きい）</p>
          </header>

          <main className="px-4 pb-24 space-y-2">
            {DATA.map((cup) => {
              const open = openYear === cup.year;
              return (
                <section key={cup.year} className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${open ? "#E4C05C" : "#24422F"}`, background: open ? "#EDE9DB" : "#132A1C" }}>

                  {/* 年ボタン */}
                  <button onClick={() => toggleYear(cup.year)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left"
                    style={{ background: open ? "#1A3826" : "transparent" }}
                    aria-expanded={open}>
                    <span className="anton text-2xl leading-none w-16 shrink-0"
                      style={{ color: open ? "#E4C05C" : "#E9E6D8" }}>{cup.year}</span>
                    <span className="text-xs w-16 shrink-0" style={{ color: "#8FA396" }}>{cup.host}</span>
                    <span className="flex-1 flex items-end gap-1.5 justify-end">
                      {cup.teams.map((t, i) => (
                        <span key={t.name} className={`relative leading-none ${FLAG_SIZE[i]}`}>
                          {t.flag}
                          {i === 0 && <span className="absolute -top-2 -right-1 text-[10px]" style={{ color: "#E4C05C" }}>★</span>}
                        </span>
                      ))}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: "#8FA396" }}>{open ? "▲" : "▼"}</span>
                  </button>

                  {/* 展開部：クリーム背景で他と差別化 */}
                  {open && (
                    <div className="rise px-3 pb-3 pt-2" style={{ color: "#1B2A20" }}>
                      <ul className="space-y-2 mt-1">
                        {cup.teams.map((t) => {
                          const rs = RANK_STYLE[t.rank];
                          const active = teamName === t.name;
                          return (
                            <li key={t.name}>
                              <button onClick={() => setTeamName(active ? null : t.name)}
                                className="w-full rounded-lg px-3 py-2.5 text-left"
                                style={{
                                  background: active ? "#FFFDF6" : "#F7F4E9",
                                  border: `1.5px solid ${active ? rs.color : "#D8D2BE"}`,
                                  boxShadow: active ? "0 1px 6px rgba(0,0,0,0.12)" : "none",
                                }}>
                                <span className="flex items-center gap-2.5">
                                  <span className="anton text-xs w-12 shrink-0" style={{ color: rs.color }}>
                                    {t.rank}{rs.star}
                                  </span>
                                  <span className="text-lg">{t.flag}</span>
                                  <span className="font-bold text-sm flex-1" style={{ color: "#1B2A20" }}>{t.name}</span>
                                  <span className="text-[10px]" style={{ color: "#8A8672" }}>{active ? "閉じる" : "イレブン"}</span>
                                </span>
                                <span className="block text-[11px] mt-1 pl-[3.6rem] font-bold" style={{ color: rs.color }}>
                                  {t.note}
                                </span>
                              </button>

                              {active && (
                                <div className="rise rounded-lg mt-1.5 p-3" style={{ background: "#0B1F14", color: "#E9E6D8" }}>
                                  <div className="flex items-baseline justify-between mb-2">
                                    <p className="font-bold text-xs">{t.match.stage} vs {t.match.opp}</p>
                                    <p className="anton text-sm" style={{ color: t.match.win ? "#E4C05C" : "#8FA396" }}>
                                      {t.match.win ? "○" : "●"} {t.match.score}
                                    </p>
                                  </div>
                                  <p className="text-[10px] tracking-[0.25em] mb-2" style={{ color: "#8FA396" }}>STARTING XI（この大会のラストマッチ）</p>
                                  <Pitch xi={t.xi} color={t.rank === "優勝" ? "#E4C05C" : t.rank === "準優勝" ? "#C2CBD3" : t.rank === "3位" ? "#C08552" : "#7E8B84"} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {/* ゴールデンボール */}
                      <div className="rounded-lg px-3 py-2.5 mt-2" style={{ background: "#F7F4E9", border: "1.5px solid #D8D2BE" }}>
                        <p className="text-[10px] tracking-[0.25em]" style={{ color: "#8A8672" }}>ゴールデンボール（大会MVP）</p>
                        <p className="font-bold text-sm mt-0.5" style={{ color: "#1B2A20" }}>
                          {cup.mvp.flag}{" "}
                          <a href={cup.mvp.wiki} target="_blank" rel="noopener noreferrer"
                            className="underline underline-offset-2" style={{ color: "#A8821F" }}>
                            {cup.mvp.name}
                          </a>
                          <span className="text-[10px] ml-1" style={{ color: "#8A8672" }}>↗ Wikipedia</span>
                        </p>
                      </div>

                      {/* 日本 */}
                      <button onClick={() => setTeamName(teamName === "JAPAN" ? null : "JAPAN")}
                        className="w-full rounded-lg px-3 py-2.5 mt-2 flex items-start gap-2 text-left"
                        style={{ background: "#E7EEF7", border: `1.5px solid ${teamName === "JAPAN" ? "#3E6FB0" : "#C3D2E4"}` }}>
                        <span className="text-base leading-none mt-0.5">🇯🇵</span>
                        <span className="flex-1">
                          <span className="block text-sm font-bold" style={{ color: "#254B7A" }}>日本：{cup.japan.label}</span>
                          <span className="block text-[11px] mt-0.5" style={{ color: "#4A6076" }}>{cup.japan.detail}</span>
                        </span>
                        {!cup.japan.out && (
                          <span className="text-[10px] mt-1 shrink-0" style={{ color: "#4A6076" }}>
                            {teamName === "JAPAN" ? "閉じる" : "イレブン"}
                          </span>
                        )}
                      </button>
                      {teamName === "JAPAN" && !cup.japan.out && (
                        <div className="rise rounded-lg mt-1.5 p-3" style={{ background: "#0B1F14", color: "#E9E6D8" }}>
                          <div className="flex items-baseline justify-between mb-2">
                            <p className="font-bold text-xs">{cup.japan.match.stage} vs {cup.japan.match.opp}</p>
                            <p className="anton text-sm" style={{ color: "#8FA396" }}>● {cup.japan.match.score}</p>
                          </div>
                          <p className="text-[10px] tracking-[0.25em] mb-2" style={{ color: "#8FA396" }}>STARTING XI（この大会のラストマッチ）</p>
                          <Pitch xi={cup.japan.xi} color="#4A90D9" />
                        </div>
                      )}
                      {teamName === "JAPAN" && cup.japan.out && (
                        <p className="text-[11px] mt-1.5 px-1" style={{ color: "#4A6076" }}>この大会は本大会出場がないため、イレブンはありません。</p>
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {/* 世界地図 + 欧州拡大図 */}
            <MapPanel title="WORLD MAP — 国旗をタップで場所を確認" note="登場国の位置（欧州の詳細は下の拡大図へ）"
              countries={MAP_WORLD} viewBox="0 0 360 175" silhouettes={WORLD_SILHOUETTES} flagSize={10} />
            <MapPanel title="EUROPE — 欧州拡大図" note="欧州の登場国はこちらで確認"
              countries={MAP_EUROPE} viewBox="0 0 320 180" silhouettes={EUROPE_SILHOUETTES} flagSize={11} />

            {/* W杯通算成績表 */}
            <section className="rounded-xl p-3 mt-1" style={{ background: "#132A1C", border: "1px solid #24422F" }}>
              <p className="text-[10px] tracking-[0.3em] mb-2" style={{ color: "#8FA396" }}>ALL-TIME RECORDS — W杯創設（1930年）以来の通算成績</p>
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="text-[11px]" style={{ color: "#8FA396", borderBottom: "1px solid #24422F" }}>
                    <th className="text-left py-1.5 font-normal">国</th>
                    <th className="text-center py-1.5 font-normal" style={{ color: "#E4C05C" }}>優勝</th>
                    <th className="text-center py-1.5 font-normal" style={{ color: "#C2CBD3" }}>準優勝</th>
                    <th className="text-center py-1.5 font-normal">ベスト4</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_TIME.map((c) => (
                    <tr key={c.name} style={{ borderBottom: "1px solid #1A3322" }}>
                      <td className="py-1.5">
                        <span className="mr-1.5">{c.flag}</span>
                        <span className="text-[13px]">{c.name}</span>
                      </td>
                      <td className="text-center anton" style={{ color: c.w > 0 ? "#E4C05C" : "#3E5346" }}>{c.w}</td>
                      <td className="text-center anton" style={{ color: c.ru > 0 ? "#C2CBD3" : "#3E5346" }}>{c.ru}</td>
                      <td className="text-center anton" style={{ color: "#E9E6D8" }}>{c.b4}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] mt-2" style={{ color: "#5F7368" }}>
                ※ ベスト4＝準決勝進出（優勝・準優勝含む）の通算回数。ドイツは西ドイツ時代を含む。ユーゴスラビア・ソ連・チェコスロバキアは当時の国名。
              </p>
            </section>

            <p className="text-[10px] pt-4 leading-relaxed" style={{ color: "#5F7368" }}>
              ※ ゴールデンボール＝FIFA公式の大会最優秀選手賞。順位・MVP・決勝と日本（02/06/10/18/22）・94年スウェーデン・22年クロアチア／モロッコの先発は公式記録・報道で確認済み。その他の3位決定戦と日本の98/14年の先発は記録ベースで、細部に表記揺れの可能性があります。
            </p>
          </main>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<WorldCupArchive />);
  </script>
</body>
</html>
