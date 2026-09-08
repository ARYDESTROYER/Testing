#!/usr/bin/env python3
"""
Turn the raw Figma exports into the three assets the canvas ships.

    python3 scripts/build_assets.py <figma-export-dir> [--out public/assets]

The two characters export with a clean alpha channel already and share one
canvas, so the light one can be revealed on top of the dark one without drifting
a pixel. Canvases are preserved rather than trimmed: the Figma frame places each
image by its full box, so cropping would move the artwork inside its rect.

The pedestal is the awkward one: it exports with the artboard's off-white baked
in behind it, including a very soft drop shadow. Keying that with a plain luma
threshold either eats the bright speckles on the plates or hard-clips the
shadow, so this does it properly:

  1. measure the background from the corners
  2. flood inward from the border through near-background pixels; whatever the
     flood cannot reach is subject, speckles included
  3. drop isolated specks of compression noise the flood stepped over
  4. give the reachable region an alpha ramped by its distance from the
     background, so anti-aliased edges and the shadow keep partial coverage
  5. un-premultiply against the background so nothing is left with a pale halo

Requires Pillow.
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - a friendlier message than a traceback
    sys.exit("This script needs Pillow:  pip install Pillow")

Image.MAX_IMAGE_PIXELS = None

NEAR = 3  # a pixel this close to the background counts as walkable
FLOOR = 3.0  # anything this close to the background is background
RAMP = 26.0  # fully opaque this far from it
MIN_ISLAND = 200  # smaller unreachable blobs are noise, not subject
MAX_DIM = 1200


def background_of(px, w: int, h: int) -> tuple[float, float, float]:
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    return tuple(sum(c[i] for c in corners) / len(corners) for i in range(3))  # type: ignore[return-value]


def key_background(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    bg = background_of(px, w, h)

    dist = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            dist[row + x] = min(
                255, int(max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])))
            )

    # --- flood the true outside from the border -----------------------------
    outside = bytearray(w * h)
    q: deque[int] = deque()

    def seed(i: int) -> None:
        if dist[i] <= NEAR and not outside[i]:
            outside[i] = 1
            q.append(i)

    for x in range(w):
        seed(x)
        seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w)
        seed(y * w + w - 1)

    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not outside[j] and dist[j] <= NEAR:
                    outside[j] = 1
                    q.append(j)

    # --- drop unreachable specks that are only compression noise -------------
    seen = bytearray(w * h)
    for start in range(w * h):
        if outside[start] or seen[start]:
            continue
        blob = []
        stack = [start]
        seen[start] = 1
        while stack:
            i = stack.pop()
            blob.append(i)
            x, y = i % w, i // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not outside[j] and not seen[j]:
                        seen[j] = 1
                        stack.append(j)
        if len(blob) < MIN_ISLAND:
            for i in blob:
                outside[i] = 1

    # --- grow the outside by one ring so edges get soft alpha ---------------
    ring = [
        j
        for i in range(w * h)
        if outside[i]
        for j in _neighbours(i, w, h)
        if not outside[j]
    ]
    for j in ring:
        outside[j] = 2

    # --- alpha + un-premultiply ---------------------------------------------
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            i = row + x
            r, g, b = px[x, y]
            if not outside[i]:
                op[x, y] = (r, g, b, 255)
                continue

            a = (dist[i] - FLOOR) / RAMP
            a = 0.0 if a < 0 else (1.0 if a > 1 else a)
            if a <= 0.0:
                op[x, y] = (0, 0, 0, 0)
                continue

            op[x, y] = (
                _clamp((r - (1 - a) * bg[0]) / a),
                _clamp((g - (1 - a) * bg[1]) / a),
                _clamp((b - (1 - a) * bg[2]) / a),
                int(round(a * 255)),
            )

    print(f"  keyed {src.name}: background {tuple(round(v, 1) for v in bg)}")
    return out


def _neighbours(i: int, w: int, h: int):
    x, y = i % w, i // w
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h:
            yield ny * w + nx


def _clamp(v: float) -> int:
    return 0 if v < 0 else (255 if v > 255 else int(round(v)))


def downscale(im: Image.Image, max_dim: int = MAX_DIM) -> Image.Image:
    if max(im.size) <= max_dim:
        return im
    s = max_dim / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", help='the "export-everything (7)/7" directory from Figma')
    ap.add_argument("--out", default="public/assets")
    args = ap.parse_args()

    root = Path(args.export_dir)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    light_src = root / "Group 2" / "image 1.png"
    dark_src = root / "Group 3" / "image 1.png"
    pedestal_src = root / "Group 2" / "image 2.png"
    for p in (light_src, dark_src, pedestal_src):
        if not p.exists():
            sys.exit(f"missing source asset: {p}")

    # --- characters ----------------------------------------------------------
    light = Image.open(light_src).convert("RGBA")
    dark = Image.open(dark_src).convert("RGBA")
    if light.size != dark.size:
        dark = dark.resize(light.size, Image.LANCZOS)
    if light.getbbox() is None or dark.getbbox() is None:
        sys.exit("a character export has no visible pixels")

    downscale(light).save(out_dir / "figure-light.png", optimize=True)
    downscale(dark).save(out_dir / "figure-dark.png", optimize=True)
    print(f"  characters {light.size[0]}x{light.size[1]}, alpha bboxes "
          f"{light.getbbox()} / {dark.getbbox()}")

    # --- pedestal ------------------------------------------------------------
    downscale(key_background(pedestal_src)).save(out_dir / "pedestal.png", optimize=True)

    for name in ("figure-light.png", "figure-dark.png", "pedestal.png"):
        p = out_dir / name
        with Image.open(p) as im:
            print(f"  {name:20} {im.size[0]}x{im.size[1]}  {p.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
