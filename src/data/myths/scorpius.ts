import type { Myth } from './types';

export const scorpiusMyth: Myth = {
  id: 'scorpius',
  tradition: 'greek',
  traditionLabel: 'ギリシャ神話',
  title: '大地が放った一匹',
  epigraph: 'アンタレス — 火星に対抗するもの。',
  scenes: [
    {
      id: 'find',
      body: '南の低い空に、大きなSの字が横たわっている。星座の形が生き物にそのまま見える、数少ない星座のひとつ。',
      focus: { kind: 'asterism', id: 'scorpius' },
    },
    {
      id: 'antares',
      heading: '心臓',
      body: '中央で赤く光るのがアンタレス。名は「アレスに対抗するもの」、つまり火星と赤さを競う星という意味を持つ。中国では心宿二、または大火と呼ばれ、その出没で農事の時を計った。',
      focus: { kind: 'star', hr: 6134 },
    },
    {
      id: 'sent',
      heading: '差し向けられたもの',
      body: '大地の女神ガイアは、獣を狩り尽くすと豪語した巨人のもとへ、この一匹を送った。体の大きさも、牙も、爪も関係がなかった。',
      figure: 'scorpion',
    },
    {
      id: 'tail',
      body: '尾の先で並んで光る二つの星は、シャウラとレサト。どちらもアラビア語で毒針を指す言葉に由来する。地平線すれすれにあるので、南の空がひらけた場所でないと見えない。',
      focus: { kind: 'stars', hrs: [6527, 6508] },
    },
    {
      id: 'reward',
      heading: '褒賞',
      body: '役目を果たした蠍は、天に上げられた。狩人と同じ空に置かれることだけは、最後まで許されなかった。',
    },
    {
      id: 'pursuit',
      body: '夏の宵、この星座が南に高く昇っているとき、オリオンは地平線の下にいる。冬になって狩人が空を渡るころ、蠍は昼の空に隠れている。追跡は毎年くり返されている。',
      focus: { kind: 'asterism', id: 'orion' },
    },
  ],
  sources: [
    'エラトステネス『カタステリスモイ』32',
    'ヒュギーヌス『天文詩』2.26',
    '『史記』天官書（心宿・大火について）',
  ],
};
