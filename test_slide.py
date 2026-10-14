"""
Quick local test — creates a sample slide without any API calls.
Run: python test_slide.py

This downloads one free stock image and renders all 6 slide positions
so you can preview the text overlay style before spending API credits.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

from src.config import BASE_DIR, load_config
from src.slide_creator import SlideCreator

# Free-to-use lifestyle photo (Unsplash, CC0)
SAMPLE_URL = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1080&h=1920&fit=crop"

SAMPLE_SLIDES = [
    "5 things nobody tells you about staying productive",
    "your brain forgets 70% of ideas within an hour",
    "writing things down isn't optional. it's survival.",
    "the people who move fast capture everything",
    "I stopped trying to remember and started writing it all down",
    "this app changed everything for me\ndownload link in bio",
]


def main():
    # Download sample background
    sample_bg = BASE_DIR / "generated" / "images" / "_sample" / "bg.jpg"
    sample_bg.parent.mkdir(parents=True, exist_ok=True)

    if not sample_bg.exists():
        print("Downloading sample background image...")
        try:
            urllib.request.urlretrieve(SAMPLE_URL, sample_bg)
            print(f"  Saved to {sample_bg}")
        except Exception as exc:
            print(f"  Download failed: {exc}")
            print("  Creating a plain gradient background instead...")
            _make_gradient(sample_bg)

    # Load config (or use defaults)
    try:
        config = load_config()
    except SystemExit:
        config = {
            "content": {"slides_per_post": 6},
            "images": {
                "width": 1080,
                "height": 1920,
                "quality": 90,
                "text": {
                    "font_size": 62,
                    "color": "white",
                    "bg_opacity": 0.65,
                    "position": "center",
                    "padding": 40,
                },
            },
        }

    creator = SlideCreator(config)
    out_dir = BASE_DIR / "generated" / "slides" / "_preview"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("\nCreating 6 preview slides...")
    for i, text in enumerate(SAMPLE_SLIDES, start=1):
        out_path = out_dir / f"preview_slide_{i:02d}.jpg"
        creator.create_slide(sample_bg, text, out_path, slide_number=i, total_slides=6)
        print(f"  Slide {i}: {out_path}")

    print(f"\nDone! Open the folder to preview: {out_dir}")
    print("If the slides look good, you're ready to run the full pipeline.")


def _make_gradient(out_path: Path):
    """Create a simple dark-to-light gradient as a fallback background."""
    img = Image.new("RGB", (1080, 1920))
    draw = ImageDraw.Draw(img)
    for y in range(1920):
        shade = int(30 + (y / 1920) * 60)
        draw.line([(0, y), (1080, y)], fill=(shade, shade + 10, shade + 20))
    img.save(str(out_path), "JPEG", quality=90)


if __name__ == "__main__":
    main()
