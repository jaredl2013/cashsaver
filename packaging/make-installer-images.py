"""
One-off asset build step (not run by build-release.ps1) — regenerates the
installer's icon/banner PNGs and .ico from packaging/lockwood-icon.svg and
packaging/lockwood-logo.svg whenever the source SVGs change. Requires
cairosvg + Pillow (both already present on this dev machine).
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
ICON_SVG = HERE / "lockwood-icon.svg"

NAVY = (11, 31, 54)       # #0B1F36 — matches the shield stroke color
BLUE = (47, 125, 225)     # #2F7DE1 — matches the shield accent color


def render_svg(svg_path: Path, out_png: Path, width: int, height: int):
    subprocess.run(
        [
            "cairosvg",
            str(svg_path),
            "-o",
            str(out_png),
            "--output-width",
            str(width),
            "--output-height",
            str(height),
        ],
        check=True,
    )


def main():
    # Square icon mark, rendered large for crisp downscaling.
    icon_src = HERE / "_icon_src.png"
    render_svg(ICON_SVG, icon_src, 512, 512)
    icon_img = Image.open(icon_src).convert("RGBA")

    # WizardSmallImageFile — square corner icon shown on every inner wizard page.
    small = icon_img.resize((144, 144), Image.LANCZOS)
    small.save(HERE / "wizard-small.png")

    # SetupIconFile — the .exe's own icon, multi-resolution.
    icon_img.save(HERE / "app-icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])

    # WizardImageFile — tall banner shown on the Welcome/Finished pages.
    # Recommended aspect ratio is 164:314; the wordmark itself is a wide strip
    # that would go tiny/illegible if squeezed into that shape, so this shows
    # just the shield mark, large, centered on a plain white banner instead.
    banner_w, banner_h = 328, 628
    banner = Image.new("RGBA", (banner_w, banner_h), (255, 255, 255, 255))
    mark_size = 190
    mark = icon_img.resize((mark_size, mark_size), Image.LANCZOS)
    mark_x = (banner_w - mark_size) // 2
    mark_y = 160
    banner.paste(mark, (mark_x, mark_y), mark)

    draw = ImageDraw.Draw(banner)
    title_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 30)
    sub_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 13)

    def centered_text(y, text, font, fill):
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((banner_w - w) / 2, y), text, font=font, fill=fill)

    centered_text(mark_y + mark_size + 34, "Lockwood IT", title_font, NAVY)

    # Manual letter-spacing for the small "SERVICES" line, matching the source SVG's look.
    sub_text = "S E R V I C E S"
    bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sub_w = bbox[2] - bbox[0]
    draw.text(((banner_w - sub_w) / 2, mark_y + mark_size + 34 + 42), sub_text, font=sub_font, fill=BLUE)

    banner.convert("RGB").save(HERE / "wizard-large.png")

    icon_src.unlink()
    print("Wrote wizard-small.png, wizard-large.png, app-icon.ico")


if __name__ == "__main__":
    main()
