"""Rebuild apps-script/Images.html from the artwork in /images.

An Apps Script web app serves no static files -- there is no URL that
./images/chore_boar_logo.png could live at -- so the artwork is inlined as a
data URI instead. Run this after changing anything in /images:

    .venv/Scripts/python tools/build_images.py

Requires Pillow:  .venv/Scripts/python -m pip install pillow
"""

import base64
import io
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# name -> (source file under /images, target width in px)
#
# The header shows the logo at roughly 48 CSS px tall, so 320px wide is ample
# for a 3x display and a fraction of the weight of the original.
ART = {
    "LOGO": ("chore_boar_logo.png", 320),
}

QUALITY = 88


def encode(path, width):
    im = Image.open(path).convert("RGBA")

    # Trim any transparent padding so CSS can size by actual content.
    box = im.getbbox()
    if box:
        im = im.crop(box)

    if im.width != width:
        height = max(1, round(im.height * width / im.width))
        im = im.resize((width, height), Image.LANCZOS)

    # WebP keeps the alpha channel at a fraction of a PNG's size. Every
    # browser that can run this app has supported it for years.
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=QUALITY, method=6)
    raw = buf.getvalue()

    return (
        "data:image/webp;base64," + base64.b64encode(raw).decode("ascii"),
        im.size,
        len(raw),
    )


def build_icon(src_dir):
    """Square home-screen icon for the wrapper page at thechoreboar.fyi.

    The logo is wide (roughly 2:1), so it is centred on the header's teal
    rather than stretched. iOS does not honour transparency on a home-screen
    icon -- it composites it onto black -- so the background is painted in.
    """
    path = os.path.join(src_dir, ART["LOGO"][0])
    im = Image.open(path).convert("RGBA")
    box = im.getbbox()
    if box:
        im = im.crop(box)

    size, pad = 180, 18
    inner = size - pad * 2
    w = inner
    h = max(1, round(im.height * w / im.width))
    if h > inner:
        h = inner
        w = max(1, round(im.width * h / im.height))
    im = im.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (46, 207, 180, 255))  # --quaternary
    canvas.paste(im, ((size - w) // 2, (size - h) // 2), im)

    out_dir = os.path.join(ROOT, "docs")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "icon.png")
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    print("%-6s %-28s %4dx%-4d  %6.1f KB"
          % ("ICON", "docs/icon.png", size, size, os.path.getsize(out) / 1024))


def main():
    src_dir = os.path.join(ROOT, "images")
    out_path = os.path.join(ROOT, "apps-script", "Images.html")

    entries = []
    for name, (filename, width) in sorted(ART.items()):
        path = os.path.join(src_dir, filename)
        if not os.path.exists(path):
            raise SystemExit("Missing artwork: %s" % path)

        uri, size, nbytes = encode(path, width)
        original = os.path.getsize(path)
        entries.append((name, uri))
        print(
            "%-6s %-28s %4dx%-4d  %6.1f KB  (was %6.1f KB)"
            % (name, filename, size[0], size[1], nbytes / 1024, original / 1024)
        )

    lines = [
        "<!-- Artwork inlined as data URIs: an Apps Script web app cannot serve",
        "     static files. GENERATED -- do not edit by hand. Change the source",
        "     in /images and re-run tools/build_images.py. -->",
        "<script>",
        "var ART = {",
    ]
    for i, (name, uri) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append('  %s: "%s"%s' % (name, uri, comma))
    lines.append("};")
    lines.append("</script>")

    with io.open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")

    build_icon(src_dir)

    print("\nWrote %s (%.1f KB)" % (
        os.path.relpath(out_path, ROOT), os.path.getsize(out_path) / 1024))


if __name__ == "__main__":
    main()
