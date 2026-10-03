"""The iPhone launch pictures: a white screen with the black VA mark, exactly
where app/boot.js draws it (centre, 44% down, 70.7% of the width). Re-run after
changing the mark or adding a phone size, and add the matching <link> in
index.html.

    python3 app/icons/make-splash.py
"""
import os
from PIL import Image, ImageDraw

MARK = [(96, 162), (155, 162), (211, 290), (267, 162), (333, 162), (415, 349), (357, 349), (300, 222), (244, 349), (178, 349)]
# (points wide, points tall, pixel ratio)
SIZES = [(320, 568, 2), (375, 667, 2), (414, 736, 3), (375, 812, 3), (414, 896, 2), (414, 896, 3), (390, 844, 3),
         (428, 926, 3), (393, 852, 3), (430, 932, 3), (402, 874, 3), (440, 956, 3), (420, 912, 3)]

here = os.path.dirname(os.path.abspath(__file__))
for w, h, k in SIZES:
    W, H = w * k * 2, h * k * 2          # drawn at double size, then halved: smooth edges
    im = Image.new('L', (W, H), 255)
    s = min(W, 460 * k * 2) * .78 / 352
    ImageDraw.Draw(im).polygon([(W / 2 + (x - 255.5) * s, H * .44 + (y - 255.5) * s) for x, y in MARK], fill=0)
    im.resize((w * k, h * k), Image.LANCZOS).save(os.path.join(here, 'splash-%dx%d.png' % (w * k, h * k)), optimize=True)
