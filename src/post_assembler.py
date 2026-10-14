"""
Assemble complete posts by pairing caption sets with generated images,
creating slide images, and writing post metadata packages.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn

from .config import BASE_DIR
from .slide_creator import SlideCreator

console = Console()


class PostAssembler:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.slides_per_post: int = config["content"]["slides_per_post"]
        self.slide_creator = SlideCreator(config)
        self.images_dir = BASE_DIR / "generated" / "images"
        self.posts_dir = BASE_DIR / "generated" / "posts"
        self.captions_path = BASE_DIR / "generated" / "captions.json"

    # ------------------------------------------------------------------

    def _available_images(self) -> dict[str, list[Path]]:
        """Index all generated images by slide type."""
        index: dict[str, list[Path]] = {}
        for i in range(1, self.slides_per_post + 1):
            slide_type = f"slide_{i}"
            slide_dir = self.images_dir / slide_type
            if slide_dir.exists():
                imgs = (
                    list(slide_dir.glob("*.jpg"))
                    + list(slide_dir.glob("*.jpeg"))
                    + list(slide_dir.glob("*.png"))
                )
                index[slide_type] = sorted(imgs)
            else:
                index[slide_type] = []
        return index

    # ------------------------------------------------------------------

    def _pick_backgrounds(
        self,
        image_index: dict[str, list[Path]],
        used_counts: dict[str, int],
    ) -> list[Path]:
        """
        Pick one background image per slide position, cycling through
        available images to maximise visual variety across posts.
        """
        chosen: list[Path] = []
        for i in range(1, self.slides_per_post + 1):
            slide_type = f"slide_{i}"
            pool = image_index.get(slide_type, [])
            if not pool:
                # Fallback: borrow from any available slide type
                all_imgs = [p for imgs in image_index.values() for p in imgs]
                if not all_imgs:
                    raise RuntimeError(
                        "No generated images found. Run 'generate-images' first."
                    )
                chosen.append(random.choice(all_imgs))
            else:
                # Round-robin through the pool
                idx = used_counts.get(slide_type, 0) % len(pool)
                chosen.append(pool[idx])
                used_counts[slide_type] = idx + 1

        return chosen

    # ------------------------------------------------------------------

    def assemble(self, caption_sets: list[dict]) -> list[dict]:
        """
        Create slide images for every caption set and write metadata.

        Returns list of post metadata dicts (also saved per-post as metadata.json).
        """
        image_index = self._available_images()
        used_counts: dict[str, int] = {}
        assembled: list[dict] = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("{task.completed}/{task.total}"),
            console=console,
        ) as progress:
            task = progress.add_task("Assembling posts...", total=len(caption_sets))

            for caption_set in caption_sets:
                post_id: str = caption_set["post_id"]
                slides_data: list[dict] = caption_set["slides"]
                slide_texts = [s["text"] for s in slides_data]

                # Pick background images
                backgrounds = self._pick_backgrounds(image_index, used_counts)

                # Create the actual slide images
                post_dir = self.posts_dir / post_id
                post_dir.mkdir(parents=True, exist_ok=True)

                try:
                    slide_paths = self.slide_creator.create_post_slides(
                        post_id, slide_texts, backgrounds
                    )
                except Exception as exc:
                    console.print(f"[red]  ✗ {post_id}: {exc}[/red]")
                    progress.advance(task)
                    continue

                # Write metadata
                meta = {
                    "post_id": post_id,
                    "hook_angle": caption_set.get("hook_angle", ""),
                    "tiktok_caption": caption_set.get("tiktok_caption", ""),
                    "hashtags": caption_set.get("hashtags", self.config["content"]["hashtags"]),
                    "slides": [
                        {
                            "slide": s["slide"],
                            "text": s["text"],
                            "image": str(slide_paths[i]),
                        }
                        for i, s in enumerate(slides_data)
                        if i < len(slide_paths)
                    ],
                    "slide_image_paths": [str(p) for p in slide_paths],
                    "scheduled": False,
                    "scheduled_at": None,
                    "socialclaw_post_id": None,
                }

                meta_path = post_dir / "metadata.json"
                meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

                assembled.append(meta)
                progress.advance(task)

        console.print(f"\n[bold green]✓ Assembled {len(assembled)} posts in generated/posts/[/bold green]")
        return assembled

    # ------------------------------------------------------------------

    def load_all_posts(self) -> list[dict]:
        """Load all assembled post metadata from disk."""
        posts: list[dict] = []
        for meta_file in sorted(self.posts_dir.glob("*/metadata.json")):
            try:
                posts.append(json.loads(meta_file.read_text(encoding="utf-8")))
            except Exception:
                pass
        return posts
