"""
Free Preview Generator — zero API cost, uses your own images.
================================================================
Uses your existing images from reference_images/ directly as
backgrounds — no DALL-E, no paid API.

  python free_preview.py               # Generate all 5 sample posts
  python free_preview.py --post 1      # Generate only post 1
  python free_preview.py --open        # Open output folder when done
  python free_preview.py --gemini      # Use Gemini free AI for captions
                                       # (add GEMINI_API_KEY= to .env first)

Slide structure:
  Slides 1-5 → lifestyle photos from reference_images/slide_1/  + text overlay
  Slide 6    → app screenshot from reference_images/slide_2/    + CTA pill at bottom
"""

from __future__ import annotations

import glob
import os
import random
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Optional

import click
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel

load_dotenv(Path(__file__).parent / ".env")
console = Console()

BASE_DIR = Path(__file__).parent
OUT_DIR = BASE_DIR / "generated" / "slides" / "_free_preview"

# ── Canvas dimensions ──────────────────────────────────────────────────────────
W, H = 1080, 1920

# ── Font candidates (Windows → macOS → Linux) ──────────────────────────────────
FONTS = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

# ── Pre-written posts for Insight (mental wellness / journaling) ───────────────
# Format: content → content → content → content → warmup → app push
SAMPLE_POSTS = [
    {
        "id": "post_01",
        "hook_angle": "things nobody tells you about your mental health",
        "slides": [
            "things nobody tells you about your mental health",
            "you can't think clearly when you're not sleeping enough",
            "your emotions affect every single decision you make",
            "most people live on autopilot and never notice",
            "I started actually checking in with myself every day",
        ],
        "cta": "Insight helped me make sense of it all\nlink in bio",
        "caption": "The stuff nobody talks about when it comes to mental health and self-awareness. Your emotional state runs your life whether you realise it or not. Start paying attention. #mentalhealth #selfawareness #journaling #fyp #mindset",
    },
    {
        "id": "post_02",
        "hook_angle": "why most people never understand themselves",
        "slides": [
            "POV: you finally understood why you react the way you do",
            "your childhood patterns show up in adult relationships",
            "anxiety isn't random — it has triggers you can learn",
            "most people never sit down and study themselves",
            "I started journaling and the patterns became impossible to ignore",
        ],
        "cta": "this app made journaling effortless\nInsight — link in bio",
        "caption": "Self-knowledge is the most underrated skill. Most people spend zero time understanding their own patterns, and wonder why the same problems keep showing up. #selfawareness #journaling #mentalhealth #fyp #personalgrowth",
    },
    {
        "id": "post_03",
        "hook_angle": "5 things that changed when I understood myself",
        "slides": [
            "5 things that changed when I started understanding myself",
            "I stopped taking everything personally",
            "I knew when I was about to burn out before it happened",
            "my relationships got noticeably better",
            "the one habit that made all of this possible",
        ],
        "cta": "Insight — AI journaling that actually works\ndownload link in bio",
        "caption": "Self-awareness changed more for me than any productivity hack, supplement, or routine. It's the foundation everything else is built on. #selfdevelopment #mentalhealth #journaling #fyp #mindfulness",
    },
    {
        "id": "post_04",
        "hook_angle": "hot take: you don't know yourself as well as you think",
        "slides": [
            "hot take: you don't know yourself as well as you think",
            "you've never actually looked at your emotional patterns",
            "your 'bad days' have triggers you could predict",
            "the version of you that makes decisions is mostly unconscious",
            "I spent 30 days documenting my own mental patterns",
        ],
        "cta": "Insight showed me things I couldn't see on my own\nlink in bio",
        "caption": "Most people are strangers to themselves. They react, not respond. They feel things without understanding why. 30 days of intentional journaling will show you more about yourself than years of guessing. #mentalhealth #journaling #selfawareness #fyp #growthmindset",
    },
    {
        "id": "post_05",
        "hook_angle": "what happens when you check in with yourself daily",
        "slides": [
            "what actually happens when you check in with yourself daily",
            "you catch stress before it becomes a breakdown",
            "you stop letting small things ruin your whole day",
            "you start making decisions from clarity, not emotion",
            "it took me 3 months to notice the difference",
        ],
        "cta": "Insight — daily check-ins that build self-knowledge\nlink in bio",
        "caption": "Daily emotional check-ins aren't soft. They're data. The people who understand their internal state make better decisions, have better relationships, and recover from setbacks faster. #mentalhealth #dailyhabits #journaling #fyp #mindset",
    },
]

# ──────────────────────────────────────────────────────────────────────────────

def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONTS:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _all_images(folder: Path) -> list[Path]:
    exts = ("*.png", "*.jpg", "*.jpeg", "*.PNG", "*.JPG", "*.JPEG")
    imgs: list[Path] = []
    for ext in exts:
        imgs.extend(folder.glob(ext))
    return sorted(imgs)


# ── Slide renderer ─────────────────────────────────────────────────────────────

def _smart_crop(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Scale + center-crop to fill the target canvas."""
    img = img.convert("RGB")
    scale = max(target_w / img.width, target_h / img.height)
    nw, nh = int(img.width * scale), int(img.height * scale)
    img = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    return img.crop((left, top, left + target_w, top + target_h))


def _dark_gradient(canvas: Image.Image, strength: float = 0.55) -> Image.Image:
    """Add a bottom-heavy dark vignette for text readability."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(H):
        t = max(0.0, (y - H * 0.25) / (H * 0.75))
        alpha = int(t ** 1.6 * strength * 255)
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, alpha))
    return Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")


def _wrap_lines(text: str, font: Any, draw: ImageDraw.ImageDraw, max_w: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textbbox((0, 0), trial, font=font)[2] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [text]


def render_content_slide(
    bg_path: Path,
    text: str,
    slide_num: int,
    total_slides: int,
    font_size: int = 64,
) -> Image.Image:
    """Lifestyle photo + text overlay — for slides 1-5."""
    bg = _smart_crop(Image.open(bg_path), W, H)
    bg = _dark_gradient(bg, strength=0.6)

    draw = ImageDraw.Draw(bg)
    font = _load_font(font_size)
    pad = 48

    lines = _wrap_lines(text, font, draw, W - pad * 4)
    line_h = [draw.textbbox((0, 0), l, font=font)[3] for l in lines]
    spacing = int(font_size * 0.38)
    block_h = sum(line_h) + spacing * max(0, len(lines) - 1)
    block_w = max(draw.textbbox((0, 0), l, font=font)[2] for l in lines)

    # Center the text block vertically (slightly above center for the hook slide)
    if slide_num == 1:
        cy = int(H * 0.48)
    else:
        cy = int(H * 0.52)

    block_y = cy - block_h // 2
    block_x = (W - block_w) // 2

    # Draw pill background
    rx0 = block_x - pad
    ry0 = block_y - pad
    rx1 = block_x + block_w + pad
    ry1 = block_y + block_h + pad

    pill = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pill)
    pdraw.rounded_rectangle([rx0, ry0, rx1, ry1], radius=20, fill=(0, 0, 0, 175))
    bg = Image.alpha_composite(bg.convert("RGBA"), pill).convert("RGB")
    draw = ImageDraw.Draw(bg)

    y = block_y
    for i, line in enumerate(lines):
        lw = draw.textbbox((0, 0), line, font=font)[2]
        x = (W - lw) // 2
        # shadow
        draw.text((x + 2, y + 2), line, font=font, fill=(0, 0, 0, 140))
        draw.text((x, y), line, font=font, fill="white")
        y += line_h[i] + spacing

    _draw_dots(draw, slide_num, total_slides)
    return bg


def render_app_slide(
    screenshot_path: Path,
    cta_text: str,
    slide_num: int,
    total_slides: int,
) -> Image.Image:
    """
    App screenshot slide — the CTA push.

    Layout: blurred/darkened lifestyle background colour,
    phone screenshot centered, CTA pill at bottom.
    """
    # Build background: dominant colour from screenshot + blur
    shot = Image.open(screenshot_path).convert("RGB")
    # Tiny blurred version as bg
    bg_small = shot.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(radius=40))
    # Darken
    darkener = Image.new("RGB", (W, H), (0, 0, 0))
    bg = Image.blend(bg_small, darkener, 0.45)

    # Place the screenshot centered, scaled to ~72% of canvas width
    max_shot_w = int(W * 0.72)
    ratio = max_shot_w / shot.width
    shot_w = max_shot_w
    shot_h = int(shot.height * ratio)

    # If too tall, constrain height instead
    max_shot_h = int(H * 0.72)
    if shot_h > max_shot_h:
        ratio = max_shot_h / shot.height
        shot_w = int(shot.width * ratio)
        shot_h = max_shot_h

    shot = shot.resize((shot_w, shot_h), Image.LANCZOS)

    # Center it in the top portion, leaving room for CTA + dots at bottom
    sx = (W - shot_w) // 2
    sy = int(H * 0.06)

    # Add a subtle white border / shadow around the screenshot
    shadow_pad = 14
    shadow = Image.new("RGB", (shot_w + shadow_pad * 2, shot_h + shadow_pad * 2), (255, 255, 255))
    shadow_blur = shadow.filter(ImageFilter.GaussianBlur(radius=18))
    bg.paste(shadow_blur, (sx - shadow_pad, sy - shadow_pad))
    bg.paste(shot, (sx, sy))

    # CTA pill at the bottom
    draw = ImageDraw.Draw(bg.convert("RGBA"))
    # Start at 52, shrink font until everything fits
    cta_font_size = 52
    pad = 44
    max_cta_w = W - pad * 4
    for attempt_size in range(cta_font_size, 28, -4):
        cta_font = _load_font(attempt_size)
        # Wrap each newline-separated segment independently
        raw_segments = cta_text.strip().split("\n")
        cta_lines: list[str] = []
        for seg in raw_segments:
            cta_lines.extend(_wrap_lines(seg, cta_font, draw, max_cta_w))
        widths = [draw.textbbox((0, 0), l, font=cta_font)[2] for l in cta_lines]
        if max(widths) <= max_cta_w:
            break
    cta_line_h = [draw.textbbox((0, 0), l, font=cta_font)[3] for l in cta_lines]
    cta_spacing = 18
    cta_block_h = sum(cta_line_h) + cta_spacing * max(0, len(cta_lines) - 1)
    cta_block_w = max(draw.textbbox((0, 0), l, font=cta_font)[2] for l in cta_lines)

    pad = 44
    # Anchor pill bottom to 110px above canvas bottom (clears the indicator dots)
    dots_clearance = 110
    pill_bottom = H - dots_clearance
    cy_start = pill_bottom - cta_block_h - pad * 2

    pill = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pill)

    px0 = (W - cta_block_w) // 2 - pad  # pad defined above in the font-shrink loop
    py0 = cy_start - pad
    px1 = (W + cta_block_w) // 2 + pad
    py1 = cy_start + cta_block_h + pad

    # Gradient-tinted pill (purple-ish to match Insight's brand)
    pdraw.rounded_rectangle([px0, py0, px1, py1], radius=22, fill=(88, 60, 180, 210))
    bg_rgba = Image.alpha_composite(bg.convert("RGBA"), pill)
    draw = ImageDraw.Draw(bg_rgba)

    y = cy_start
    for i, line in enumerate(cta_lines):
        lw = draw.textbbox((0, 0), line, font=cta_font)[2]
        x = (W - lw) // 2
        draw.text((x + 2, y + 2), line, font=cta_font, fill=(0, 0, 0, 120))
        draw.text((x, y), line, font=cta_font, fill="white")
        y += cta_line_h[i] + cta_spacing

    bg_final = bg_rgba.convert("RGB")
    _draw_dots(ImageDraw.Draw(bg_final), slide_num, total_slides)
    return bg_final


def _draw_dots(draw: ImageDraw.ImageDraw, current: int, total: int) -> None:
    r, gap = 7, 26
    total_w = total * r * 2 + (total - 1) * (gap - r * 2)
    sx = (W - total_w) // 2
    y = H - 62
    for i in range(1, total + 1):
        cx = sx + (i - 1) * gap + r
        fill = (255, 255, 255, 230) if i == current else (255, 255, 255, 70)
        draw.ellipse([cx - r, y - r, cx + r, y + r], fill=fill)


# ── Gemini caption generator (optional, free tier) ─────────────────────────────

def generate_with_gemini(topic: str, app_name: str, app_desc: str, cta: str) -> dict | None:
    """Generate post captions using Google Gemini free tier."""
    try:
        import google.generativeai as genai  # pip install google-generativeai
    except ImportError:
        console.print("[yellow]google-generativeai not installed. Run: pip install google-generativeai[/yellow]")
        return None

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        console.print("[yellow]GEMINI_API_KEY not set in .env[/yellow]")
        return None

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")  # free tier

    prompt = f"""Create a 6-slide TikTok carousel for a mental wellness journaling app.

Topic: {topic}
App: {app_name} — {app_desc}
CTA: {cta}

Rules:
- Slides 1-4: pure lifestyle/mental health content, NO app mention
- Slide 5: subtle personal transition (still no app name)
- Slide 6: natural app mention + CTA
- Each slide: max 12 words, punchy, real
- Slide 1 is the hook — make it stop the scroll

Return JSON only:
{{
  "slides": ["slide 1 text", "slide 2 text", "slide 3 text", "slide 4 text", "slide 5 text"],
  "cta": "slide 6 text (2 lines: what changed + CTA)",
  "caption": "200+ char TikTok caption with hashtags #mentalhealth #journaling #fyp"
}}"""

    try:
        response = model.generate_content(prompt)
        import json, re
        raw = response.text
        # Strip markdown code fences if present
        raw = re.sub(r"```(?:json)?", "", raw).strip().strip("`")
        return json.loads(raw)
    except Exception as exc:
        console.print(f"[red]Gemini error: {exc}[/red]")
        return None


# ── Main post generator ────────────────────────────────────────────────────────

def generate_post(
    post_data: dict,
    lifestyle_images: list[Path],
    app_images: list[Path],
    post_idx: int,
    use_gemini: bool = False,
) -> list[Path]:
    """Render all 6 slides for one post. Returns list of output paths."""
    post_id = post_data["id"]
    out_dir = OUT_DIR / post_id
    out_dir.mkdir(parents=True, exist_ok=True)

    slides_text: list[str] = post_data["slides"]  # 5 content slides
    cta: str = post_data["cta"]
    total_slides = len(slides_text) + 1  # +1 for the app slide

    output_paths: list[Path] = []

    # ── Slides 1-5: lifestyle photos with text ─────────────────────────────────
    for i, text in enumerate(slides_text, start=1):
        # Pick background: cycle through available lifestyle images
        bg = lifestyle_images[(post_idx * 5 + i - 1) % len(lifestyle_images)]
        out_path = out_dir / f"slide_{i:02d}.jpg"

        img = render_content_slide(bg, text, i, total_slides)
        img.save(str(out_path), "JPEG", quality=92)
        output_paths.append(out_path)
        console.print(f"  [green]✓[/green] slide {i:02d}: [dim]{text[:50]}[/dim]")

    # ── Slide 6: app screenshot + CTA ─────────────────────────────────────────
    app_img = app_images[post_idx % len(app_images)]
    out_path = out_dir / f"slide_{total_slides:02d}.jpg"
    img = render_app_slide(app_img, cta, total_slides, total_slides)
    img.save(str(out_path), "JPEG", quality=92)
    output_paths.append(out_path)
    console.print(f"  [cyan]✓[/cyan] slide {total_slides:02d}: [dim]{cta.replace(chr(10), ' | ')}[/dim]")

    return output_paths


# ── CLI ─────────────────────────────────────────────────────────────────────────

from typing import Any  # noqa: E402 (needed above but imported here for clarity)


@click.command()
@click.option("--post", "-p", default=None, type=int,
              help="Generate only this post number (1-5). Default: all.")
@click.option("--open-folder", "-o", "open_folder", is_flag=True, default=False,
              help="Open the output folder when done.")
@click.option("--gemini", is_flag=True, default=False,
              help="Use Gemini free AI to generate fresh captions.")
@click.option("--topic", default=None,
              help="Topic for Gemini caption generation (used with --gemini).")
def main(post, open_folder, gemini, topic):
    """
    Free preview generator — uses your images, zero API cost.

    Generates TikTok carousel previews using reference images from
    reference_images/slide_1/ (lifestyle backgrounds) and
    reference_images/slide_2/ (app screenshots for the final slide).
    """
    console.print(Panel(
        "[bold cyan]Free Preview Generator[/bold cyan]\n"
        "Uses your images directly — [green]$0 cost[/green]",
        subtitle="Insight Marketing Bot",
    ))

    # ── Gather images ──────────────────────────────────────────────────────────
    slide1_dir = BASE_DIR / "reference_images" / "slide_1"
    slide2_dir = BASE_DIR / "reference_images" / "slide_2"

    lifestyle_imgs = _all_images(slide1_dir)
    app_imgs = _all_images(slide2_dir)

    if not lifestyle_imgs:
        console.print(f"[red]No images in {slide1_dir}[/red]")
        console.print("Drop your Pinterest lifestyle photos in reference_images/slide_1/")
        sys.exit(1)

    if not app_imgs:
        console.print(f"[yellow]No app screenshots in {slide2_dir}[/yellow]")
        console.print("Using a lifestyle photo for the final slide instead.")
        app_imgs = lifestyle_imgs

    console.print(f"[dim]Lifestyle images: {len(lifestyle_imgs)} | App screenshots: {len(app_imgs)}[/dim]\n")

    # ── Choose posts ────────────────────────────────────────────────────────────
    posts_to_run = SAMPLE_POSTS if post is None else [SAMPLE_POSTS[post - 1]]

    # ── Optional Gemini override ────────────────────────────────────────────────
    if gemini and topic:
        console.print(f"[cyan]Generating captions with Gemini for topic: '{topic}'...[/cyan]")
        result = generate_with_gemini(
            topic=topic,
            app_name="Insight",
            app_desc="AI journaling app that tracks your emotions and finds patterns",
            cta="link in bio",
        )
        if result:
            custom_post = {
                "id": "post_gemini",
                "hook_angle": topic,
                "slides": result["slides"],
                "cta": result.get("cta", "Insight — link in bio"),
                "caption": result.get("caption", ""),
            }
            posts_to_run = [custom_post]
            console.print("[green]✓ Gemini captions generated[/green]\n")

    # ── Generate ────────────────────────────────────────────────────────────────
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_outputs: list[Path] = []

    for i, post_data in enumerate(posts_to_run):
        console.print(f"[bold]Post {i+1}/{len(posts_to_run)}: {post_data['hook_angle']}[/bold]")
        paths = generate_post(post_data, lifestyle_imgs, app_imgs, post_idx=i)
        all_outputs.extend(paths)
        console.print()

    # ── Summary ─────────────────────────────────────────────────────────────────
    console.print(Panel(
        f"[bold green]Done! {len(all_outputs)} slides created[/bold green]\n\n"
        f"Output: [cyan]{OUT_DIR}[/cyan]\n\n"
        f"[dim]Each post folder = 6 slides ready for TikTok.\n"
        f"If these look good, run the full pipeline to generate 120 posts:[/dim]\n"
        f"[bold]python main.py run-all[/bold]",
        title="Preview Complete",
    ))

    if open_folder:
        if sys.platform == "win32":
            os.startfile(str(OUT_DIR))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(OUT_DIR)])
        else:
            subprocess.run(["xdg-open", str(OUT_DIR)])


if __name__ == "__main__":
    main()
