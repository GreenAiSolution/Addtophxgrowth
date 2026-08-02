# hg — monogram and identity

A script monogram drawn from a pencil sketch of a joined lowercase **h** and **g**,
plus the identity sheet that presents it.

Open `index.html` in a browser for the full sheet: origin, the mark, lockups,
palette, type, mockups, clear space and minimum size.

## What's here

| File | What it is |
| --- | --- |
| `build.py` | Generates every SVG below. The curves live here, once. |
| `index.html` | The identity sheet. Self-contained — no external fonts, scripts or images. |
| `hg-monogram.svg` | The mark, drawn in `currentColor` so it inherits from its context. |
| `hg-monogram-ink.svg` | Graphite, for dropping in as an `<img>`. |
| `hg-monogram-reversed.svg` | Paper on graphite. |
| `hg-seal.svg` | The ringed stamp, for tags and stickers. |
| `hg-lockup-stacked.svg` | Mark over wordmark. The primary lockup. |
| `hg-lockup-horizontal.svg` | Mark beside wordmark, for headers and footers. |

## Regenerating

```
python3 build.py
```

No dependencies. The mark's path data, the pen weight (`STROKE`) and the wordmark
string (`WORDMARK` / `SUBMARK`) are all constants at the top of the file — change
one and every asset follows.

The exit flourish tapers, and SVG has no variable-width stroke. `build.py` splits
the final cubic into short pieces whose `stroke-width` eases down; at those lengths
the round caps overlap and the steps aren't visible. That's why the tail is a run of
short paths rather than one long one.

## Notes for production

- The lockup SVGs set the wordmark as live `<text>` in a system serif stack, so they
  render differently on different machines. Convert the text to outlines before
  sending anything to a printer.
- The mark holds down to about 24 px tall. Below that the ascender loop fills in.
- One flat colour only — no gradient, no fill, no shadow.

## Open question

The wordmark reads **handmade / by halle** throughout, taken from the reference site
this was formatted after. If the brand name is something else, it's one string in
`build.py` and one line in `index.html`. The mark itself doesn't change either way.
