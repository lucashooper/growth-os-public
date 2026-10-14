"""
Generate image variations for each slide position.

If reference images exist in reference_images/slide_N/, the generator
analyses them with GPT-4o vision and builds DALL-E 3 prompts that
match their aesthetic.  Without reference images it falls back to
niche-aware prompts so you can still generate content immediately.
"""

from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any

from openai import OpenAI
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

from .config import BASE_DIR, get_api_key

console = Console()

SLIDE_STYLE_HINTS: dict[str, str] = {
    "slide_1": "eye-catching, high contrast, striking visual hook that stops the scroll",
    "slide_2": "aspirational lifestyle, clean composition, warm tones",
    "slide_3": "moody atmospheric editorial, artistic perspective",
    "slide_4": "bright inspiring scene, uplifting, positive energy",
    "slide_5": "sophisticated minimal, thoughtful, calm focus",
    "slide_6": "warm and inviting, professional, action-oriented",
}


class ImageGenerator:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.client = OpenAI(api_key=get_api_key("OPENAI_API_KEY"))
        self.niche: str = config["app"].get("niche", "lifestyle")
        self.visual_style: str = config["content"].get(
            "visual_style", "aesthetic lifestyle photography, editorial quality"
        )
        self.ref_dir = BASE_DIR / "reference_images"
        self.out_dir = BASE_DIR / "generated" / "images"

    # ------------------------------------------------------------------
    # Vision analysis
    # ------------------------------------------------------------------

    def _describe_reference(self, image_path: Path) -> str:
        """Ask GPT-4o to describe the aesthetic of a reference image."""
        ext = image_path.suffix.lower().lstrip(".")
        mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        encoded = base64.b64encode(image_path.read_bytes()).decode()

        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{encoded}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe this image in 2-3 sentences for image generation. "
                                "Focus on: visual style, color palette, mood/atmosphere, "
                                "subject matter, lighting, composition. "
                                "Do NOT mention any text, watermarks, logos, or faces."
                            ),
                        },
                    ],
                }
            ],
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def _build_prompt(self, description: str, slide_type: str) -> str:
        style_hint = SLIDE_STYLE_HINTS.get(slide_type, "aesthetic, high quality")
        return (
            f"High quality {self.niche} lifestyle photography. "
            f"{description}. "
            f"Style: {style_hint}. {self.visual_style}. "
            f"Shot on professional camera, natural or cinematic lighting, editorial quality. "
            f"Vertical format 9:16. No text, no watermarks, no faces."
        )

    def _niche_prompt(self, slide_type: str) -> str:
        style_hint = SLIDE_STYLE_HINTS.get(slide_type, "aesthetic, high quality")
        return (
            f"High quality {self.niche} lifestyle photography. "
            f"{self.visual_style}. "
            f"Style: {style_hint}. "
            f"Professional camera, cinematic lighting. "
            f"Vertical format 9:16. No text, no watermarks, no people."
        )

    # ------------------------------------------------------------------
    # Single image generation
    # ------------------------------------------------------------------

    def _generate_one(self, prompt: str, out_path: Path) -> bool:
        """Generate one DALL-E 3 image and save it as JPEG."""
        try:
            response = self.client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1024x1792",   # closest to 9:16
                quality="standard",
                n=1,
                response_format="b64_json",
            )
            image_bytes = base64.b64decode(response.data[0].b64_json)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(image_bytes)
            return True
        except Exception as exc:
            console.print(f"[red]  ✗ DALL-E error: {exc}[/red]")
            return False

    # ------------------------------------------------------------------
    # Batch generation per slide type
    # ------------------------------------------------------------------

    def _generate_for_slide_type(self, slide_type: str, count: int) -> list[Path]:
        out_dir = self.out_dir / slide_type
        out_dir.mkdir(parents=True, exist_ok=True)

        ref_dir = self.ref_dir / slide_type
        reference_images = (
            list(ref_dir.glob("*.jpg"))
            + list(ref_dir.glob("*.jpeg"))
            + list(ref_dir.glob("*.png"))
            if ref_dir.exists()
            else []
        )

        generated: list[Path] = []

        if reference_images:
            per_ref = max(1, count // len(reference_images))
            for ref_img in reference_images:
                console.print(f"  [dim]Analysing {ref_img.name}...[/dim]")
                try:
                    description = self._describe_reference(ref_img)
                    prompt = self._build_prompt(description, slide_type)
                except Exception as exc:
                    console.print(f"  [yellow]Vision analysis failed ({exc}), using niche prompt[/yellow]")
                    prompt = self._niche_prompt(slide_type)

                for _ in range(per_ref):
                    existing = len(list(out_dir.glob("*.jpg")))
                    out_path = out_dir / f"{slide_type}_{existing + 1:04d}.jpg"
                    if self._generate_one(prompt, out_path):
                        generated.append(out_path)
                        console.print(f"  [green]✓[/green] {out_path.name}")
        else:
            prompt = self._niche_prompt(slide_type)
            for _ in range(count):
                existing = len(list(out_dir.glob("*.jpg")))
                out_path = out_dir / f"{slide_type}_{existing + 1:04d}.jpg"
                if self._generate_one(prompt, out_path):
                    generated.append(out_path)
                    console.print(f"  [green]✓[/green] {out_path.name}")

        return generated

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(self, count_per_slide: int | None = None) -> dict[str, list[Path]]:
        """Generate images for all slide types. Returns {slide_type: [paths]}."""
        slides_per_post: int = self.config["content"]["slides_per_post"]
        if count_per_slide is None:
            count_per_slide = self.config["content"].get("images_per_slide_type", 20)

        results: dict[str, list[Path]] = {}

        for i in range(1, slides_per_post + 1):
            slide_type = f"slide_{i}"
            console.print(f"\n[bold cyan]▸ Generating images for {slide_type}[/bold cyan] ({count_per_slide} target)")
            results[slide_type] = self._generate_for_slide_type(slide_type, count_per_slide)

        total = sum(len(v) for v in results.values())
        console.print(f"\n[bold green]✓ Generated {total} images total[/bold green]")
        return results
