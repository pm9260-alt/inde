import type { Myth } from './types';

export const orionMyth: Myth = {
  id: 'orion',
  tradition: 'greek',
  traditionLabel: 'ギリシャ神話',
  title: '追われる狩人',
  epigraph: '彼が西に沈むころ、東の地平から蠍が昇る。',
  scenes: [
    {
      id: 'find',
      body: 'まず、同じ明るさの星が三つ、等しい間隔で斜めに並んでいるところを探す。狩人の腰に巻かれた帯。この三つさえ見つかれば、残りの形はひとりでに浮かび上がってくる。',
      focus: { kind: 'stars', hrs: [1852, 1903, 1948] },
    },
    {
      id: 'shoulders',
      body: '帯の左上で赤く濁っているのがベテルギウス、右下で青白く冴えているのがリゲル。狩人の右肩と左足にあたる。色がこれほど違って見える星の組み合わせは、空にそう多くない。',
      focus: { kind: 'stars', hrs: [2061, 1713] },
    },
    {
      id: 'hunter',
      heading: '狩人',
      body: 'オリオンは海の神ポセイドンの子で、その弓は外れたことがなかった。ある日、彼は言った。地上のどんな獣も、自分に敵う者はいない、と。',
      figure: 'orion-hunter',
    },
    {
      id: 'gaia',
      heading: '大地の怒り',
      body: 'その言葉を、大地の女神ガイアが聞いていた。獣たちを産んだ者として、彼女はそれを許さなかった。放たれたのは、たった一匹の蠍だった。',
      figure: 'scorpion',
    },
    {
      id: 'sting',
      body: '巨人を倒したのは矢でも剣でもなかった。足もとの草むらから伸びた、小さな毒針だった。',
      focus: { kind: 'star', hr: 2004 },
    },
    {
      id: 'placed',
      heading: '空へ',
      body: 'ゼウスは二人をともに星座にした。ただし、決して同じ空には置かなかった。',
    },
    {
      id: 'still-running',
      body: 'オリオンが西の地平に沈みきるころ、東からさそり座が姿を現す。二千年たっても、狩人はまだ追いつかれていない。',
      focus: { kind: 'asterism', id: 'scorpius' },
    },
  ],
  sources: [
    'アポロドーロス『ギリシア神話』1.4.3–5',
    'アラトス『ファイノメナ』634–646',
    'ヒュギーヌス『天文詩』2.26, 2.34',
  ],
};
