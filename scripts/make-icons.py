#!/usr/bin/env python3
"""
Draw the home-screen and favicon set.

The mark is the park marker: a green dot inside a cream ring, the same two
colours the walk uses everywhere. Drawn rather than rasterised from SVG,
because the shapes are two circles and adding a native SVG rasteriser to the
toolchain to draw two circles is a bad trade. Requires Pillow.

    python3 scripts/make-icons.py

Outputs land in public/icons/ and are committed. Re-run only if the mark
changes; the icons are stable artefacts, not build output.
"""
from PIL import Image, ImageDraw

CREAM = (246, 241, 231, 255)
GREEN = (63, 122, 99, 255)
DEEP = (23, 49, 42, 255)

# name, size, background, whether the mark must sit inside the maskable safe
# zone (the 80% centre circle Android may crop to)
TARGETS = [
    ("icon-192.png", 192, CREAM, False),
    ("icon-512.png", 512, CREAM, False),
    ("icon-maskable-512.png", 512, CREAM, True),
    # iOS does not honour transparency or SVG here, and composites onto white
    # if the image has an alpha hole, so this is drawn opaque on cream.
    ("apple-touch-icon.png", 180, CREAM, False),
    ("favicon-32.png", 32, CREAM, False),
]

# Link previews are wide, so the square mark is centred on a cream field
# rather than stretched. No text: the fonts the walk uses are webfonts, and a
# card set in whatever the drawing library falls back to looks worse than a
# card with nothing written on it.
OG_SIZE = (1200, 630)


def draw(size: int, background, maskable: bool) -> Image.Image:
    # Supersample and downscale: Pillow has no antialiased circle, and at
    # 32 px an aliased ring reads as a smudge.
    scale = 8
    image = Image.new("RGBA", (size * scale, size * scale), background)
    canvas = ImageDraw.Draw(image)
    side = size * scale
    centre = side / 2

    # The mark fills 62% of the icon normally, 46% when it has to survive a
    # maskable crop to the centre 80%.
    outer = side * (0.23 if maskable else 0.31)
    ring_width = outer * 0.26

    canvas.ellipse(
        [centre - outer, centre - outer, centre + outer, centre + outer],
        fill=GREEN,
    )
    inner = outer - ring_width
    canvas.ellipse(
        [centre - inner, centre - inner, centre + inner, centre + inner],
        outline=CREAM,
        width=int(ring_width * 0.62),
    )
    core = inner * 0.42
    canvas.ellipse(
        [centre - core, centre - core, centre + core, centre + core],
        fill=DEEP,
    )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    import pathlib

    out = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for name, size, background, maskable in TARGETS:
        draw(size, background, maskable).save(out / name)
        print(f"wrote {out.relative_to(out.parent.parent)}/{name} ({size}px)")

    card = Image.new("RGBA", OG_SIZE, CREAM)
    mark = draw(OG_SIZE[1], CREAM, False)
    card.paste(mark, ((OG_SIZE[0] - OG_SIZE[1]) // 2, 0), mark)
    card.save(out / "og-card.png")
    print(f"wrote {out.relative_to(out.parent.parent)}/og-card.png ({OG_SIZE[0]}x{OG_SIZE[1]})")


if __name__ == "__main__":
    main()
