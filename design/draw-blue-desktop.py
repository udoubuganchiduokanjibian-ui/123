"""Render the desktop's blue ribbons on a fixed pixel grid."""

from pathlib import Path

from PIL import Image


WIDTH, HEIGHT = 640, 400
COLOR_STEP = 3
DITHER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def mix(first, second, amount):
    return tuple(a + (b - a) * amount for a, b in zip(first, second))


def smoothstep(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def color_at(x, y):
    sky = mix((24, 57, 115), (92, 180, 187), y ** 1.32)
    edge_light = max(0, 1 - ((x - 0.95) / 0.62) ** 2 - (y / 0.75) ** 2)
    sky = mix(sky, (66, 138, 173), edge_light * 0.54)
    for start, reach, thickness in [(0.24, 0.68, 0.133), (0.47, 0.62, 0.19), (0.76, 0.48, 0.17)]:
        edge = start - reach * y + 0.22 * y * y
        width = thickness * (1 - 0.65 * y)
        depth = (x - edge) / width
        glow = smoothstep((depth + 0.22) / 0.35) * (1 - smoothstep(depth))
        sky = mix(sky, (134, 225, 223), glow * 0.42 * (1 - y))
    return sky


wallpaper = Image.new("RGB", (WIDTH, HEIGHT))
wallpaper.putdata([
    tuple(max(0, min(255, COLOR_STEP * int(channel / COLOR_STEP + DITHER[y % 4][x % 4] / 16)))
          for channel in color_at(x / WIDTH, y / HEIGHT))
    for y in range(HEIGHT)
    for x in range(WIDTH)
])
target = Path(__file__).resolve().parents[1] / "public/reader/blue-desktop.png"
target.parent.mkdir(parents=True, exist_ok=True)
wallpaper.save(target, optimize=True)
