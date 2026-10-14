"""
Create TikTok-style slide images.

Takes a background image + slide text and produces a 1080×1920 JPEG
with the text overlaid in a clean, readable TikTok-native style.
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from rich.console import Console

from .config import BASE_DIR

console = Console()

# Paths to try for a bold system font (Windows, macOS, Linux)
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",          # Windows Arial Bold
    r"C:\Windows\Fonts\seguisb.ttf",           # Windows Segoe UI Semibold
    r"C:\Windows\Fonts\calibrib.ttf",          # Windows Calibri Bold
    "/System/Library/Fonts/Helvetica.ttc",     # macOS
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
]

TARGET_W = 1080
TARGET_H = 1920


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # Fallback to PIL's built-in bitmap font (ugly but always works)
    return ImageFont.load_default()


def _wrap_text(text: str, font: Any, draw: ImageDraw.ImageDraw, max_width: int) -> list[str]:
    """Word-wrap text to fit inside max_width pixels."""
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        trial = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines or [text]


class SlideCreator:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        img_cfg = config.get("images", {})
        self.target_w: int = img_cfg.get("width", TARGET_W)
        self.target_h: int = img_cfg.get("height", TARGET_H)
        self.quality: int = img_cfg.get("quality", 90)

        text_cfg = img_cfg.get("text", {})
        self.font_size: int = text_cfg.get("font_size", 62)
        self.text_color: str = text_cfg.get("color", "white")
        self.bg_opacity: float = text_cfg.get("bg_opacity", 0.65)
        self.position: str = text_cfg.get("position", "center")
        self.padding: int = text_cfg.get("padding", 40)

        self.slides_dir = BASE_DIR / "generated" / "slides"

    # ------------------------------------------------------------------

    def _prepare_background(self, image_path: Path) -> Image.Image:
        """Load and crop image to exactly target dimensions (smart crop)."""
        img = Image.open(image_path).convert("RGB")
        # Scale so the smallest dimension fits, then center-crop
        scale = max(self.target_w / img.width, self.target_h / img.height)
        new_w = int(img.width * scale)
        new_h = int(img.height * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

        left = (new_w - self.target_w) // 2
        top = (new_h - self.target_h) // 2
        img = img.crop((left, top, left + self.target_w, top + self.target_h))
        return img

    # ------------------------------------------------------------------

    def _add_gradient_overlay(self, img: Image.Image) -> Image.Image:
        """Add a subtle dark gradient at the bottom 60% for text readability."""
        overlay = Image.new("RGBA", (self.target_w, self.target_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        gradient_start = int(self.target_h * 0.35)
        for y in range(gradient_start, self.target_h):
            # Alpha ramps from 0 to ~160 over the gradient region
            progress = (y - gradient_start) / (self.target_h - gradient_start)
            alpha = int(progress * 160)
            draw.line([(0, y), (self.target_w, y)], fill=(0, 0, 0, alpha))

        return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    # ------------------------------------------------------------------

    def _draw_text_block(
        self,
        img: Image.Image,
        text: str,
        slide_number: int,
        total_slides: int,
    ) -> Image.Image:
        """Draw text with a semi-transparent pill/strip background."""
        draw = ImageDraw.Draw(img)
        font = _load_font(self.font_size)

        # Available text width (with padding on both sides)
        max_text_w = self.target_w - self.padding * 4

        lines = _wrap_text(text, font, draw, max_text_w)

        # Measure total text block height
        line_heights = [draw.textbbox((0, 0), l, font=font)[3] for l in lines]
        line_spacing = int(self.font_size * 0.35)
        block_h = sum(line_heights) + line_spacing * (len(lines) - 1)
        block_w = max(draw.textbbox((0, 0), l, font=font)[2] for l in lines)

        # Position the block
        pad = self.padding
        if self.position == "bottom":
            block_y = self.target_h - block_h - pad * 4
        else:
            # Center the text block
            block_y = (self.target_h - block_h) // 2

        block_x = (self.target_w - block_w) // 2

        # Draw semi-transparent background rectangle
        rect_x0 = block_x - pad
        rect_y0 = block_y - pad
        rect_x1 = block_x + block_w + pad
        rect_y1 = block_y + block_h + pad

        # Create overlay for the text background
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        alpha = int(self.bg_opacity * 255)
        overlay_draw.rounded_rectangle(
            [rect_x0, rect_y0, rect_x1, rect_y1],
            radius=16,
            fill=(0, 0, 0, alpha),
        )
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(img)

        # Draw each line of text
        y = block_y
        for i, line in enumerate(lines):
            line_bbox = draw.textbbox((0, 0), line, font=font)
            line_w = line_bbox[2] - line_bbox[0]
            x = (self.target_w - line_w) // 2

            # Subtle drop shadow for depth
            draw.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 160))
            draw.text((x, y), line, font=font, fill=self.text_color)

            y += line_heights[i] + line_spacing

        # Slide indicator dots at the bottom (e.g. • • • ◉ • •)
        self._draw_slide_indicator(draw, slide_number, total_slides)

        return img

    # ------------------------------------------------------------------

    def _draw_slide_indicator(
        self,
        draw: ImageDraw.Draw,
        current: int,
        total: int,
    ) -> None:
        """Draw small dots at the bottom to indicate which slide this is."""
        dot_r = 6
        dot_gap = 22
        total_w = total * dot_r * 2 + (total - 1) * (dot_gap - dot_r * 2)
        start_x = (self.target_w - total_w) // 2
        y = self.target_h - 55

        for i in range(1, total + 1):
            cx = start_x + (i - 1) * dot_gap + dot_r
            color = (255, 255, 255, 230) if i == current else (255, 255, 255, 80)
            draw.ellipse(
                [cx - dot_r, y - dot_r, cx + dot_r, y + dot_r],
                fill=color,
            )

    # ------------------------------------------------------------------

    def create_slide(
        self,
        background_path: Path,
        text: str,
        out_path: Path,
        slide_number: int = 1,
        total_slides: int = 6,
    ) -> Path:
        """
        Create one slide image.

        Args:
            background_path: Source lifestyle image.
            text: The slide text to overlay.
            out_path: Where to save the result JPEG.
            slide_number: 1-based position in the slideshow.
            total_slides: Total slides in the post.

        Returns:
            Path to the saved slide.
        """
        img = self._prepare_background(background_path)
        img = self._add_gradient_overlay(img)
        img = self._draw_text_block(img, text, slide_number, total_slides)

        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(str(out_path), "JPEG", quality=self.quality, optimize=True)
        return out_path

    # ------------------------------------------------------------------

    def create_post_slides(
        self,
        post_id: str,
        slide_texts: list[str],
        background_paths: list[Path],
    ) -> list[Path]:
        """
        Create all slides for one post.

        Args:
            post_id: Unique post identifier (e.g. "post_0001").
            slide_texts: List of text strings, one per slide.
            background_paths: List of background image paths, one per slide.

        Returns:
            List of paths to the created slide images.
        """
        out_dir = self.slides_dir / post_id
        out_dir.mkdir(parents=True, exist_ok=True)

        total = len(slide_texts)
        created: list[Path] = []

        for i, (text, bg) in enumerate(zip(slide_texts, background_paths), start=1):
            out_path = out_dir / f"slide_{i:02d}.jpg"
            self.create_slide(bg, text, out_path, slide_number=i, total_slides=total)
            created.append(out_path)
            console.print(f"  [green]✓[/green] {post_id}/slide_{i:02d}.jpg")

        return created
