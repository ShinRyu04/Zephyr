"""Generate ikon sumber Zephyr (1024x1024 PNG) — glyph 'Z' + hembusan angin.
Dipakai sekali lalu diproses `npx tauri icon` menjadi semua ukuran.
"""
from PIL import Image, ImageDraw
import math

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Latar rounded-square gradasi biru gelap (mirip token --bg/--surface Zephyr)
radius = 208
top = (18, 24, 38)
bottom = (10, 14, 24)
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bgd = ImageDraw.Draw(bg)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    bgd.line([(0, y), (S, y)], fill=c + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill=255)
img.paste(bg, (0, 0), mask)

# Aksen: dua sapuan angin di belakang huruf
def wind(y0, x0, x1, thick, col):
    pts = []
    steps = 80
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + math.sin(t * math.pi) * 26
        pts.append((x, y))
    d.line(pts, fill=col, width=thick, joint="curve")

wind(300, 150, 700, 26, (56, 132, 255, 90))
wind(756, 330, 880, 26, (56, 132, 255, 70))

# Huruf Z dibentuk manual (polygon) supaya tidak bergantung font sistem
bar = 96          # ketebalan batang horizontal
z_top = 300
z_bot = 724
x_l, x_r = 268, 756
poly = [
    (x_l, z_top),
    (x_r, z_top),
    (x_r, z_top + bar),
    (x_l + 196, z_bot - bar),
    (x_r, z_bot - bar),
    (x_r, z_bot),
    (x_l, z_bot),
    (x_l, z_bot - bar),
    (x_r - 196, z_top + bar),
    (x_l, z_top + bar),
]
d.polygon(poly, fill=(232, 240, 255, 255))

# Titik aksen biru (branding)
d.ellipse([796, 258, 872, 334], fill=(56, 132, 255, 255))

img.save("src-tauri/icon-source.png")
print("OK ->", "src-tauri/icon-source.png", img.size)
