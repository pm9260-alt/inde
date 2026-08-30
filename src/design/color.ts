/** デザイントークンの色を WebGL 用の 0〜1 の RGB に直す。 */
export type Rgb = readonly [number, number, number];

const cache = new Map<string, Rgb>();

export const rgbFromHex = (hex: string): Rgb => {
  const cached = cache.get(hex);
  if (cached) return cached;
  const value = parseInt(hex.replace('#', ''), 16);
  const rgb: Rgb = [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
  cache.set(hex, rgb);
  return rgb;
};
