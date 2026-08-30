/** 表示用の書式。 */

const COMPASS_POINTS = [
  '北',
  '北北東',
  '北東',
  '東北東',
  '東',
  '東南東',
  '南東',
  '南南東',
  '南',
  '南南西',
  '南西',
  '西南西',
  '西',
  '西北西',
  '北西',
  '北北西',
] as const;

/** 方位角（度）を 16 方位の日本語に。 */
export const compassName = (azimuthDeg: number): string => {
  const normalized = ((azimuthDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index];
};

/** 高度（度）を「低い / 中ほど / 高い / 真上」で言い分ける。 */
export const altitudeName = (altitudeDeg: number): string => {
  if (altitudeDeg >= 75) return 'ほぼ真上';
  if (altitudeDeg >= 45) return '高い空';
  if (altitudeDeg >= 20) return '中ほどの空';
  if (altitudeDeg >= 0) return '低い空';
  return '地平線の下';
};

/** 「南の低い空」のような一言。 */
export const skyPositionPhrase = (altitudeDeg: number, azimuthDeg: number): string => {
  if (altitudeDeg < 0) return `${compassName(azimuthDeg)}の地平線の下`;
  if (altitudeDeg >= 75) return 'ほぼ真上';
  return `${compassName(azimuthDeg)}の${altitudeName(altitudeDeg)}`;
};

/** 等級を「4.2 等」の形に。 */
export const magnitudeLabel = (magnitude: number): string =>
  `${magnitude.toFixed(1)} 等`;

/**
 * 月の満ち欠けの度合いを言い表す。
 * 満ちていく途中か欠けていく途中かは輝面比だけでは決まらないので、
 * 「上弦」「下弦」とは呼ばずに度合いだけを言う。
 */
export const moonPhaseName = (illumination: number): string => {
  if (illumination < 0.03) return '新月';
  if (illumination > 0.97) return '満月';
  if (Math.abs(illumination - 0.5) < 0.06) return '半月';
  const percent = Math.round(illumination * 100);
  return illumination < 0.5 ? `細い月（輝面 ${percent}%）` : `太った月（輝面 ${percent}%）`;
};
