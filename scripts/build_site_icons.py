#!/usr/bin/env python3
"""Build the site's icon set and social card from the one brand asset it has.

Source: assets/west-peek-productions-logo.jpeg (200x200, "WP" mark over the
wordmark). Outputs, all committed and served from the site root:

  favicon.ico                 16/32/48 px, the WP mark only (the wordmark is
                              illegible below 64 px)
  apple-touch-icon.png        180x180
  assets/icon-192.png         192x192  (site.webmanifest)
  assets/icon-512.png         512x512  (site.webmanifest)
  assets/og/west-peek-productions-og.png  1200x630 social card

Run by hand when the logo changes (`npm run icons:build`); the outputs are
static. scripts/validators/validate_site_icons.js checks their presence and
pixel sizes, so a missing or wrong-sized file fails CI rather than silently
404ing (favicon.ico returned 404 on 11 Oct 2026).
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', 'west-peek-productions-logo.jpeg')

FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def font(size):
    for f in FONT_CANDIDATES:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    sys.exit('build_site_icons: no TrueType font found; refusing to emit a bitmap-font social card')


def mark(logo):
    # The WP mark occupies the top ~60% of the logo; square it with white margin.
    gray = logo.convert('L')
    top = gray.crop((0, 0, logo.width, int(logo.height * 0.6)))
    bbox = Image.eval(top, lambda p: 255 if p < 128 else 0).getbbox()
    m = logo.crop(bbox)
    side = int(max(m.size) * 1.18)
    sq = Image.new('RGB', (side, side), 'white')
    sq.paste(m, ((side - m.width) // 2, (side - m.height) // 2))
    return sq


def main():
    logo = Image.open(SRC).convert('RGB')
    wp = mark(logo)
    wp.resize((48, 48), Image.LANCZOS).save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    wp.resize((180, 180), Image.LANCZOS).save(os.path.join(ROOT, 'apple-touch-icon.png'), optimize=True)
    for s in (192, 512):
        wp.resize((s, s), Image.LANCZOS).save(os.path.join(ROOT, 'assets', f'icon-{s}.png'), optimize=True)

    card = Image.new('RGB', (1200, 630), 'white')
    big = logo.resize((420, 420), Image.LANCZOS)
    card.paste(big, (60, 105))
    d = ImageDraw.Draw(card)
    d.rectangle((520, 150, 526, 480), fill='black')
    d.text((570, 170), 'West Peek Productions', font=font(52), fill='black')
    lines = ['Virtual, hybrid and executive', 'broadcast production help', '', 'virtualagency-os.com']
    y = 260
    for line in lines:
        d.text((570, y), line, font=font(38), fill='#333333')
        y += 54
    os.makedirs(os.path.join(ROOT, 'assets', 'og'), exist_ok=True)
    card.save(os.path.join(ROOT, 'assets', 'og', 'west-peek-productions-og.png'), optimize=True)
    print('build_site_icons: favicon.ico, apple-touch-icon.png, assets/icon-192.png, assets/icon-512.png, assets/og/west-peek-productions-og.png')


if __name__ == '__main__':
    main()
