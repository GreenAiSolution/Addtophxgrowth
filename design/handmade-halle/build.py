#!/usr/bin/env python3
"""Generate the hg monogram asset set.

The mark is one drawn line, so it lives here as path data rather than in five
hand-copied SVG files that would drift apart the first time a curve is nudged.
Run `python3 build.py` from this directory to rewrite the .svg files.

The exit flourish tapers. SVG has no variable-width stroke, so the final cubic
is split into short pieces whose stroke-width eases down — at these lengths the
round caps overlap and the steps disappear.
"""

from pathlib import Path

HERE = Path(__file__).parent

# ---------------------------------------------------------------- the drawing

STROKE = 21          # the pen. Everything else is proportioned off it.
TAIL_END = 4.5       # width where the flourish leaves the page
TAIL_PIECES = 14

# The h — stem, and the ascender loop that closes back onto it.
H_STEM = ("M78 466C76 396 76 334 78 288C80 214 82 148 85 94"
          "C87 52 64 20 52 48C42 72 62 152 70 216C74 252 76 270 78 288")

# The shoulder springing off the stem, carrying straight into the g's bowl.
# One stroke: this junction is the whole idea of the mark.
SHOULDER_BOWL = ("M79 302C86 240 130 208 188 222C248 238 294 278 322 322"
                 "C346 358 346 414 316 446C286 478 232 480 196 454"
                 "C158 428 150 378 166 334C178 300 200 272 230 250")

# The descender, its loop, and the run-up into the flourish.
DESCENDER = ("M336 410C358 464 367 540 367 620C367 690 339 754 295 772"
             "C251 790 204 768 202 726C200 686 226 646 262 596")

# The flourish, as one cubic before it is split for the taper.
TAIL = ((262, 596), (302, 540), (368, 450), (484, 246))

VIEWBOX = "24 8 476 792"     # tight to the ink, with even breathing room
BBOX = (35, 19, 487, 789)    # what the strokes actually cover


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _split(p0, p1, p2, p3, t):
    q0, q1, q2 = _lerp(p0, p1, t), _lerp(p1, p2, t), _lerp(p2, p3, t)
    r0, r1 = _lerp(q0, q1, t), _lerp(q1, q2, t)
    s = _lerp(r0, r1, t)
    return (p0, q0, r0, s), (s, r1, q2, p3)


def _pieces(cubic, n):
    out, cur = [], cubic
    for i in range(n - 1):
        head, cur = _split(*cur, 1.0 / (n - i))
        out.append(head)
    out.append(cur)
    return out


def _n(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def mark_paths(indent="  "):
    """The mark, as <path> elements. Colour comes from the parent group."""
    rows = [f'<path stroke-width="{_n(STROKE)}" d="{d}"/>'
            for d in (H_STEM, SHOULDER_BOWL, DESCENDER)]
    for i, (a, b, c, d) in enumerate(_pieces(TAIL, TAIL_PIECES)):
        u = (i + 0.5) / TAIL_PIECES
        w = STROKE + (TAIL_END - STROKE) * (u ** 4.5)   # eased: full for longer
        rows.append(
            f'<path stroke-width="{_n(w)}" d="M{_n(a[0])} {_n(a[1])}'
            f'C{_n(b[0])} {_n(b[1])} {_n(c[0])} {_n(c[1])} {_n(d[0])} {_n(d[1])}"/>')
    return "\n".join(indent + r for r in rows)


def mark_group(color="currentColor", indent="  ", transform=None):
    t = f' transform="{transform}"' if transform else ""
    return (f'{indent}<g{t} fill="none" stroke="{color}" stroke-linecap="round" '
            f'stroke-linejoin="round">\n{mark_paths(indent + "  ")}\n{indent}</g>')


# ------------------------------------------------------------------- the files

SERIF = "ui-serif, 'Hoefler Text', 'Iowan Old Style', Palatino, Georgia, serif"
SANS = "ui-sans-serif, -apple-system, 'Helvetica Neue', Arial, sans-serif"
INK = "#26252A"
PAPER = "#FAF8F4"

# Change this in one place and rebuild; every lockup follows.
WORDMARK = "handmade"
SUBMARK = "BY HALLE"


def head(vb, w, h, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" '
            f'width="{w}" height="{h}" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>')


def monogram(color, ground=None, name="hg monogram"):
    bg = f'\n  <rect x="24" y="8" width="476" height="792" fill="{ground}"/>' if ground else ""
    return f"{head(VIEWBOX, 476, 792, name)}{bg}\n{mark_group(color)}\n</svg>\n"


def seal():
    """The stamp: for kraft tags, stickers, the back of a parcel.

    The mark's far corner is its ascender loop, 428 units out from the mark's
    own centre — that, not the bounding box, is what has to clear the ring.
    """
    s = 0.70
    tx, ty = 450 - 261 * s, 450 - 404 * s
    # Two half-arcs, not one 360 arc: a full circle whose start and end points
    # coincide has no defined sweep, and the text silently fails to place.
    band = "M450 844A394 394 0 0 1 450 56A394 394 0 0 1 450 844"   # 50% = top
    return (f'{head("0 0 900 900", 900, 900, "hg seal")}\n'
            f'  <defs><path id="hg-seal-band" d="{band}" fill="none"/></defs>\n'
            f'  <circle cx="450" cy="450" r="436" fill="none" stroke="currentColor" stroke-width="7"/>\n'
            f'  <circle cx="450" cy="450" r="352" fill="none" stroke="currentColor" stroke-width="2.5"/>\n'
            f'  <text fill="currentColor" font-family="{SANS}" font-size="43" letter-spacing="12">'
            f'<textPath href="#hg-seal-band" startOffset="50%" text-anchor="middle">'
            f'{WORDMARK.upper()} {SUBMARK}</textPath></text>\n'
            f'{mark_group(transform=f"translate({_n(tx)} {_n(ty)}) scale({s})")}\n'
            f'</svg>\n')


def lockup_horizontal():
    s = 0.40
    tx, ty = 40 - 35 * s, 30 - 19 * s
    return (f'{head("0 0 860 370", 860, 370, "hg horizontal lockup")}\n'
            f'{mark_group(transform=f"translate({_n(tx)} {_n(ty)}) scale({s})")}\n'
            f'  <text x="300" y="180" fill="currentColor" font-family="{SERIF}" '
            f'font-size="86" letter-spacing="17">{WORDMARK}</text>\n'
            f'  <text x="304" y="248" fill="currentColor" font-family="{SANS}" '
            f'font-size="30" letter-spacing="15" opacity="0.72">{SUBMARK}</text>\n'
            f'</svg>\n')


def lockup_stacked():
    s = 0.64
    tx, ty = 300 - 261 * s, 34 - 19 * s
    return (f'{head("0 0 600 740", 600, 740, "hg stacked lockup")}\n'
            f'{mark_group(transform=f"translate({_n(tx)} {_n(ty)}) scale({s})")}\n'
            f'  <text x="300" y="632" text-anchor="middle" fill="currentColor" '
            f'font-family="{SERIF}" font-size="74" letter-spacing="15">{WORDMARK}</text>\n'
            f'  <text x="300" y="694" text-anchor="middle" fill="currentColor" '
            f'font-family="{SANS}" font-size="26" letter-spacing="13" opacity="0.72">{SUBMARK}</text>\n'
            f'</svg>\n')


FILES = {
    "hg-monogram.svg": monogram("currentColor"),
    "hg-monogram-ink.svg": monogram(INK, name="hg monogram, graphite"),
    "hg-monogram-reversed.svg": monogram(PAPER, ground=INK, name="hg monogram, reversed"),
    "hg-seal.svg": seal(),
    "hg-lockup-horizontal.svg": lockup_horizontal(),
    "hg-lockup-stacked.svg": lockup_stacked(),
}

if __name__ == "__main__":
    for name, body in FILES.items():
        (HERE / name).write_text(body)
        print(f"wrote {name}")
