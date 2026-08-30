import type { Myth } from './types';

export const cassiopeiaMyth: Myth = {
  id: 'cassiopeia',
  tradition: 'greek',
  traditionLabel: 'ギリシャ神話',
  title: '逆さの王妃',
  epigraph: '北の空を、沈むことなく回り続ける。',
  scenes: [
    {
      id: 'find',
      body: '北の空に、Wの字。あるいは向きによってはMの字。五つの星がつくるこの折れ線は、いちど覚えると二度と見失わない。',
      focus: { kind: 'asterism', id: 'cassiopeia' },
    },
    {
      id: 'queen',
      heading: '王妃',
      body: 'カシオペヤはエチオピアの王妃だった。娘アンドロメダの美しさは、海に住むニンフたちの誰よりも上だと、彼女は口にした。',
      figure: 'cassiopeia-queen',
    },
    {
      id: 'sea',
      heading: '海の返答',
      body: 'ニンフたちの訴えを受け、海の神ポセイドンは怪物ケートスを送った。国を救う道はひとつしかないと告げられ、王妃は娘を海辺の岩に鎖でつないだ。',
      figure: 'cetus',
    },
    {
      id: 'perseus',
      body: 'そこへ、メドゥーサの首を携えたペルセウスが通りかかる。娘は助かった。',
      figure: 'perseus',
    },
    {
      id: 'punishment',
      heading: '玉座ごと',
      body: '王妃は玉座に座ったまま天に上げられた。ただし、一日のうち半分は逆さまになって回るという条件がついていた。傲りへの罰として。',
    },
    {
      id: 'never-sets',
      body: '北極星をはさんで、この星座の反対側に北斗七星がある。片方が低いとき、もう片方は高い。二つとも地平線の下に沈まないので、季節と時刻さえ合えば、いつでもどちらかが見つかる。',
      focus: { kind: 'asterism', id: 'big-dipper' },
    },
  ],
  sources: [
    'アポロドーロス『ギリシア神話』2.4.3',
    'オウィディウス『変身物語』4.663–764',
    'ヒュギーヌス『天文詩』2.10',
  ],
};
