/**
 * 書体の読み込み。
 *
 * どちらも大平善道氏による Zen ファミリーで、骨格が共通しているため
 * 明朝とゴシックを混ぜても字面が揃う。ライセンスは SIL OFL 1.1。
 *
 * 読み込みは各ウェイトの下位パスから個別に行う。パッケージの入口
 * （@expo-google-fonts/zen-old-mincho）を import すると、使っていない
 * ウェイトまで全部が再エクスポートされ、そのすべてがアプリに同梱される。
 * 実測で 37MB と 15MB の差になる。
 *
 * さらに、いまは日本語の全字種を含む TTF をそのまま積んでいるため、
 * 4 書体で約 15MB ある。公開前には使用文字だけに絞り込むことを想定して
 * いる。詳細は docs/SETUP-WINDOWS.md の「公開前の作業」を参照。
 */
import { useFonts } from 'expo-font';

import { ZenKakuGothicNew_400Regular } from '@expo-google-fonts/zen-kaku-gothic-new/400Regular';
import { ZenKakuGothicNew_500Medium } from '@expo-google-fonts/zen-kaku-gothic-new/500Medium';
import { ZenOldMincho_400Regular } from '@expo-google-fonts/zen-old-mincho/400Regular';
import { ZenOldMincho_600SemiBold } from '@expo-google-fonts/zen-old-mincho/600SemiBold';

export const useAppFonts = (): boolean => {
  const [loaded, error] = useFonts({
    ZenOldMincho_400Regular,
    ZenOldMincho_600SemiBold,
    ZenKakuGothicNew_400Regular,
    ZenKakuGothicNew_500Medium,
  });
  // 読み込みに失敗しても、既定の書体で表示は続けられる。
  return loaded || error != null;
};
