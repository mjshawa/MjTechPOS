"""
Regenerates the PWA icons in public/icons from the brand colours.
Optional: only needed if you change the logo. Requires: pip install pillow
Usage:  python3 scripts/generate-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

BG, WHITE, AMBER = (15, 23, 42), (255, 255, 255), (251, 191, 36)   # slate-900, white, amber-400
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'      # change if you are on another OS
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
S = 1024  # draw big, then downscale for clean edges


def draw_mark(d, size):
    """The logo mark, kept inside the central 80% so it also survives Android's maskable crop."""
    big = ImageFont.truetype(FONT, int(size * 0.40))
    small = ImageFont.truetype(FONT, int(size * 0.135))
    cx = size / 2
    d.text((cx, size * 0.385), 'Mj', font=big, fill=WHITE, anchor='mm')
    bar_w, bar_h, bar_y = size * 0.26, size * 0.018, size * 0.665
    d.rounded_rectangle([cx - bar_w / 2, bar_y, cx + bar_w / 2, bar_y + bar_h], radius=bar_h / 2, fill=AMBER)
    d.text((cx, size * 0.765), 'POS', font=small, fill=AMBER, anchor='mm')


def make(rounded):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    draw_mark(d, S)
    return img


def save(img, name, px):
    img.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
rounded, square = make(True), make(False)
save(rounded, 'icons/icon-192.png', 192)
save(rounded, 'icons/icon-512.png', 512)
save(square, 'icons/maskable-512.png', 512)        # full-bleed, for adaptive icons
save(square, 'icons/apple-touch-icon.png', 180)    # iOS rounds the corners itself
save(rounded, 'icons/favicon-32.png', 32)
print('icons written to', os.path.abspath(os.path.join(OUT, 'icons')))
