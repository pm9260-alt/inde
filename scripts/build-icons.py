"""
アプリアイコンとスプラッシュ画像を生成する。

意匠
----
オリオン座の三つ星。このアプリを最初に開いた人が最初に探す形であり、
5 つの星座のうち最も見つけやすく、最も知られた並びでもある。
斜めに三つ並ぶだけの形は、40 ピクセルまで縮んでも読める。

星は点ではなく、芯とにじみでできている。描画側のシェーダと同じ考え方で
作ることで、アイコンと画面の中の星が同じものに見える。

実行: python3 scripts/build-icons.py
"""
import math
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")

# デザイントークンと同じ値を使う（src/design/tokens.ts）
INK_DEEP = (0x0A, 0x0D, 0x13)
INK_VOID = (0x05, 0x07, 0x0B)
TEXT_PRIMARY = (0xEF, 0xE8, 0xDC)
EMBER_CORE = (0xF2, 0xA8, 0x5E)
EMBER_DEEP = (0x7A, 0x53, 0x30)


def draw_star(pixels, size, cx, cy, radius, color, intensity=1.0):
    """芯とにじみでできた星を加算で置く。starLayer.ts のシェーダと同じ形。"""
    reach = int(radius * 4.5)
    for y in range(max(0, int(cy - reach)), min(size, int(cy + reach) + 1)):
        for x in range(max(0, int(cx - reach)), min(size, int(cx + reach) + 1)):
            d = math.hypot(x - cx, y - cy) / radius
            if d > 4.5:
                continue
            halo = math.exp(-1.5 * d * d)
            core = max(0.0, 1.0 - d / 0.75) ** 1.4
            value = min(1.0, (halo * 0.5 + core * 0.9) * intensity)
            if value <= 0.002:
                continue
            base = pixels[x, y]
            pixels[x, y] = tuple(
                min(255, int(base[i] + color[i] * value)) for i in range(3)
            )


def draw_line(pixels, size, x0, y0, x1, y1, width, color, intensity):
    """星をつなぐ線。縁をやわらかく落とす。"""
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return
    ux, uy = dx / length, dy / length
    half = width / 2
    pad = int(half + 2)
    for y in range(max(0, int(min(y0, y1) - pad)), min(size, int(max(y0, y1) + pad) + 1)):
        for x in range(max(0, int(min(x0, x1) - pad)), min(size, int(max(x0, x1) + pad) + 1)):
            px, py = x - x0, y - y0
            along = px * ux + py * uy
            if along < 0 or along > length:
                continue
            across = abs(px * -uy + py * ux)
            if across > half:
                continue
            edge = 1.0 - max(0.0, (across / half - 0.4) / 0.6)
            value = intensity * edge
            if value <= 0.002:
                continue
            base = pixels[x, y]
            pixels[x, y] = tuple(
                min(255, int(base[i] + color[i] * value)) for i in range(3)
            )


def build(size, background, star_scale=1.0, with_line=True, margin=0.27):
    image = Image.new("RGB", (size, size), background)
    pixels = image.load()

    # 三つ星。左下から右上へ、実際の見え方に近い傾きで。
    span = size * (1 - margin * 2)
    cx, cy = size / 2, size / 2
    angle = math.radians(-28)
    positions = []
    for t in (-0.5, 0.0, 0.5):
        positions.append(
            (cx + math.cos(angle) * span * t, cy + math.sin(angle) * span * t)
        )

    if with_line:
        draw_line(
            pixels, size,
            positions[0][0], positions[0][1],
            positions[2][0], positions[2][1],
            max(1.0, size * 0.0045), EMBER_DEEP, 0.55,
        )

    base_radius = size * 0.052 * star_scale
    # 中央のアルニラムがいちばん明るい。両端はわずかに小さく。
    for (px, py), scale in zip(positions, (0.92, 1.0, 0.95)):
        draw_star(pixels, size, px, py, base_radius * scale, TEXT_PRIMARY, 1.0)

    return image


def main():
    os.makedirs(ASSETS, exist_ok=True)

    icon = build(1024, INK_DEEP)
    icon.save(os.path.join(ASSETS, "icon.png"))

    # Android のアダプティブアイコンは外周が切り落とされるので余白を多く取る。
    adaptive = build(1024, INK_DEEP, margin=0.34)
    adaptive.save(os.path.join(ASSETS, "adaptive-icon.png"))

    # 起動画面。周囲は app.json の backgroundColor で塗られるため、
    # 星だけを小さく置く。
    splash = build(1024, INK_VOID, star_scale=0.8, margin=0.33)
    splash.save(os.path.join(ASSETS, "splash-icon.png"))

    favicon = build(96, INK_DEEP, star_scale=1.2, with_line=False, margin=0.24)
    favicon.save(os.path.join(ASSETS, "favicon.png"))

    print("生成しました:", ", ".join(sorted(os.listdir(ASSETS))))


if __name__ == "__main__":
    main()
