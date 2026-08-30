import type { Myth } from './types';

export const tanabataMyth: Myth = {
  id: 'tanabata',
  tradition: 'japanese',
  traditionLabel: '七夕の伝承',
  title: '年に一度の渡し',
  epigraph: '天の川をはさんで、二つの星が向かい合っている。',
  scenes: [
    {
      id: 'find',
      body: '夏の宵、頭上に大きな三角形。三つとも一等星なので、街の空でも見つけられる。この形を手がかりに、こと座、わし座、はくちょう座が順に見えてくる。',
      focus: { kind: 'asterism', id: 'summer-triangle' },
    },
    {
      id: 'two-stars',
      heading: '向かい合う二つ',
      body: 'いちばん明るく、青みを帯びているのがベガ。織姫、または織女星。そこから南へ下がったところにあるのがアルタイル、彦星。二つのあいだを天の川が流れている。',
      focus: { kind: 'stars', hrs: [7001, 7557] },
    },
    {
      id: 'weaver',
      heading: '機を織る娘',
      body: '天帝の娘は、毎日ひとりで機を織っていた。父はその働きぶりを憐れんで、川の向こうで牛を飼う若者と娶わせた。',
      figure: 'weaver',
    },
    {
      id: 'separation',
      body: '二人はよく暮らし、そして働かなくなった。機は止まり、牛は痩せた。怒った天帝は、二人を川の両岸へ引き離した。',
      figure: 'herdsman',
    },
    {
      id: 'once-a-year',
      body: '許されたのは、年に一度だけ。七月七日の夜、鵲が翼をつらねて橋を架ける。雨が降れば川は増水し、その年は会えないという。',
      figure: 'magpie-bridge',
    },
    {
      id: 'deneb',
      heading: '渡し場',
      body: '三角形の残る一つ、デネブ。中国の星の区分では、この一帯を天津と呼ぶ。天の川の渡し場という意味で、デネブはその四番目の星、天津四にあたる。',
      focus: { kind: 'star', hr: 7924 },
    },
    {
      id: 'milky-way',
      body: '天の川そのものは、都市の空ではまず見えない。それでも、この三つの星は残っている。二人を隔てているものが見えなくなっても、二人は向かい合ったままそこにいる。',
    },
  ],
  sources: [
    '『万葉集』巻八・巻十（七夕歌群）',
    '『荊楚歳時記』七月七日条',
    '『儀礼準拠 中国の星座の歴史』（天津・天津四の同定）',
  ],
};
