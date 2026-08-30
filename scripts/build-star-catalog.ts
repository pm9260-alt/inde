/**
 * 星表ビルダー
 * ---------------------------------------------------------------------------
 * Yale Bright Star Catalogue, 5th Revised Edition (Hoffleit & Warren 1991)
 * を取得し、アプリが必要とする最小限の項目だけを src/data/stars.generated.ts
 * に書き出す。
 *
 * 出典
 *   一次データ : Harvard TDC  http://tdc-www.harvard.edu/catalogs/bsc5.html
 *   JSON 変換  : https://github.com/brettonw/YaleBrightStarCatalog (MIT)
 *
 * 座標系 : 赤経・赤緯とも equinox J2000.0 / epoch 2000.0。
 *
 * 固有運動について
 *   BSC5 は pmRA / pmDE を持つが、単位系（RA 秒か大円秒か）の解釈に曖昧さが
 *   あるため意図的に不使用。J2000 から 2026 年までの 26 年間で、最も速い
 *   Arcturus でも移動量は約 0.015°。本アプリの表示誤差目標（0.3°）に対して
 *   1/20 以下であり、無視して差し支えない。
 *
 * 実行 : npm run build:catalog
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_URL =
  'https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5.json';
/** 固有名（Common name）のみを持つ簡約版。本体には Common 欄が無いため併用する。 */
const NAMES_URL =
  'https://raw.githubusercontent.com/brettonw/YaleBrightStarCatalog/master/bsc5-short.json';

/** 背景星として書き出す上限等級。実行時の可視判定はこれより明るい側で行う。 */
const MAGNITUDE_LIMIT = 4.5;

/**
 * 星座線に使う星の HR 番号（Harvard Revised = Bright Star Number）。
 * 等級が MAGNITUDE_LIMIT より暗くても必ず書き出す。
 */
const REQUIRED_HR = [
  // オリオン座
  2061, 1713, 1790, 1852, 1903, 1948, 2004, 1879,
  // 北斗七星（おおぐま座）+ アルコル
  4301, 4295, 4554, 4660, 4905, 5054, 5191, 5062,
  // カシオペヤ座
  168, 21, 264, 403, 542,
  // さそり座
  6134, 5984, 5953, 5944, 6084, 6165, 6241, 6247, 6271, 6380, 6553, 6615, 6580, 6527, 6508,
  // 夏の大三角
  7001, 7924, 7557,
];

/**
 * IAU-WGSN が定めた固有名での上書き。
 * BSC5 の Name 欄は歴史的な綴りや非公式名（γ Cas の "Navi" など）を含むため、
 * 表示に使う名前は IAU 公認リストに合わせる。
 * 出典: IAU Working Group on Star Names, "IAU Catalog of Star Names" (2024-06)
 */
const IAU_NAME_OVERRIDES: Record<number, string> = {
  264: 'Tsih', // BSC5 は "Navi"（非公式）。IAU 公認は Tsih。
  6084: 'Alniyat', // σ Sco。BSC5 は "Al Niyat"。
  6165: 'Paikauhale', // τ Sco。BSC5 は τ にも Alniyat を当てているが IAU では別名。
  5062: 'Alcor',
  6580: 'Girtab',
};

interface RawStar {
  HR?: string;
  RA?: string;
  Dec?: string;
  Vmag?: string;
  'B-V'?: string;
  Name?: string;
  Bayer?: string;
  Constellation?: string;
  [k: string]: unknown;
}

/** "05h 55m 10.3s" → 度 */
function parseRa(s: string): number {
  const m = /^\s*(\d+)h\s*(\d+)m\s*([\d.]+)s\s*$/.exec(s);
  if (!m) throw new Error(`RA を解釈できません: ${JSON.stringify(s)}`);
  const hours = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return hours * 15;
}

/** "+07° 24′ 25″" → 度 */
function parseDec(s: string): number {
  const m = /^\s*([+-])\s*(\d+)°\s*(\d+)′\s*([\d.]+)″\s*$/.exec(s);
  if (!m) throw new Error(`Dec を解釈できません: ${JSON.stringify(s)}`);
  const deg = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === '-' ? -deg : deg;
}

/**
 * 色指数 B-V から有効温度を推定する。
 * Ballesteros, F. J. (2012), "New insights into black bodies",
 * EPL 97, 34008. arXiv:1201.1809
 */
function temperatureFromBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/**
 * 黒体温度からプランク軌跡上の CIE 1931 xy 色度を求める。
 * Kim, Y. et al. (2002) の三次近似式。1667K–25000K で有効。
 */
function planckianXy(kelvin: number): [number, number] {
  const t = Math.min(25000, Math.max(1667, kelvin));
  const t2 = t * t;
  const t3 = t2 * t;
  let x: number;
  if (t < 4000) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.17991;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.24039;
  }
  const x2 = x * x;
  const x3 = x2 * x;
  let y: number;
  if (t < 2222) {
    y = -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683;
  } else if (t < 4000) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  }
  return [x, y];
}

/** CIE xy → 線形 sRGB（最大成分を 1 に正規化） */
function linearSrgbFromXy(x: number, y: number): [number, number, number] {
  const bigY = 1;
  const bigX = (x / y) * bigY;
  const bigZ = ((1 - x - y) / y) * bigY;
  // sRGB / D65 の XYZ→線形RGB 変換行列 (IEC 61966-2-1)
  let r = 3.2404542 * bigX - 1.5371385 * bigY - 0.4985314 * bigZ;
  let g = -0.969266 * bigX + 1.8760108 * bigY + 0.041556 * bigZ;
  let b = 0.0556434 * bigX - 0.2040259 * bigY + 1.0572252 * bigZ;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const peak = Math.max(r, g, b, 1e-6);
  return [r / peak, g / peak, b / peak];
}

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

async function main(): Promise<void> {
  process.stdout.write(`星表を取得しています: ${CATALOG_URL}\n`);
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`取得に失敗しました: HTTP ${response.status}`);
  }
  const raw = (await response.json()) as RawStar[];
  process.stdout.write(`  ${raw.length} 件を読み込みました\n`);

  process.stdout.write(`固有名を取得しています: ${NAMES_URL}\n`);
  const namesResponse = await fetch(NAMES_URL);
  if (!namesResponse.ok) {
    throw new Error(`取得に失敗しました: HTTP ${namesResponse.status}`);
  }
  const nameRows = (await namesResponse.json()) as { HR?: string; N?: string }[];
  const commonNames = new Map<number, string>();
  for (const row of nameRows) {
    if (row.HR && row.N) commonNames.set(Number(row.HR), row.N);
  }

  const required = new Set(REQUIRED_HR);
  const rows: string[] = [];
  const seen = new Set<number>();

  for (const star of raw) {
    if (!star.HR || !star.RA || !star.Dec || !star.Vmag) continue;
    const hr = Number(star.HR);
    const mag = Number(star.Vmag);
    if (!Number.isFinite(hr) || !Number.isFinite(mag)) continue;
    if (mag > MAGNITUDE_LIMIT && !required.has(hr)) continue;
    if (seen.has(hr)) continue;
    seen.add(hr);

    const bvRaw = star['B-V'];
    const bv = bvRaw != null && bvRaw !== '' ? Number(bvRaw) : null;
    // B-V が無い星は太陽近傍の平均的な A/F 型を仮定せず、無彩色として扱う。
    const color: [number, number, number] =
      bv != null && Number.isFinite(bv)
        ? linearSrgbFromXy(...planckianXy(temperatureFromBV(bv)))
        : [1, 1, 1];

    const name = IAU_NAME_OVERRIDES[hr] ?? commonNames.get(hr);

    const fields = [
      `hr:${hr}`,
      `ra:${round(parseRa(star.RA), 5)}`,
      `dec:${round(parseDec(star.Dec), 5)}`,
      `mag:${round(mag, 2)}`,
      `color:[${color.map((c) => round(c, 3)).join(',')}]`,
    ];
    if (name) fields.push(`name:${JSON.stringify(name)}`);
    rows.push(`  { ${fields.join(', ')} },`);
  }

  const missing = REQUIRED_HR.filter((hr) => !seen.has(hr));
  if (missing.length > 0) {
    throw new Error(`星座線に必要な星が見つかりません: HR ${missing.join(', ')}`);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, '..', 'src', 'data', 'stars.generated.ts');
  mkdirSync(dirname(outPath), { recursive: true });

  const header = `/**
 * 自動生成ファイル — 直接編集しないでください。
 * 再生成: npm run build:catalog
 *
 * 出典: Yale Bright Star Catalogue, 5th Revised Edition
 *       (Hoffleit, D. & Warren, W. H. Jr., 1991)
 *       Harvard TDC http://tdc-www.harvard.edu/catalogs/bsc5.html
 *
 * 座標系: equinox J2000.0 / epoch 2000.0（固有運動は未適用）
 * 収録範囲: V <= ${MAGNITUDE_LIMIT} 等 + 星座線に必要な星
 * 色: B-V 色指数 → 有効温度 (Ballesteros 2012) → プランク軌跡 (Kim et al. 2002)
 *     → 線形 sRGB（最大成分を 1 に正規化）
 */

export interface CatalogStar {
  /** Harvard Revised 番号。星の一意な識別子として用いる。 */
  hr: number;
  /** 赤経 J2000.0（度） */
  ra: number;
  /** 赤緯 J2000.0（度） */
  dec: number;
  /** V 等級 */
  mag: number;
  /** 線形 sRGB の星色。最大成分が 1。 */
  color: readonly [number, number, number];
  /** IAU 公認固有名（あれば） */
  name?: string;
}

export const STAR_CATALOG: readonly CatalogStar[] = [
`;

  writeFileSync(outPath, `${header}${rows.join('\n')}\n];\n`, 'utf8');
  process.stdout.write(`  ${rows.length} 件を書き出しました → ${outPath}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
