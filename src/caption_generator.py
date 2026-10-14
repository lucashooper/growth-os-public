"""
Generate slide-by-slide captions that follow the viral formula:

  content → content → content → content → ad warmup → app push

The AI writes from the perspective of a real person sharing authentic
lifestyle content, only weaving in the app naturally at the end.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from openai import OpenAI
from rich.console import Console

from .config import BASE_DIR, get_api_key

console = Console()

SYSTEM_PROMPT = """You are a viral TikTok slideshow content writer for app founders.

Your posts follow this EXACT format (never deviate):
- Slides 1-4: Pure lifestyle/niche content. Zero mention of any product or app.
  Use angles like: curiosity hooks, "things nobody tells you," niche opinions,
  POV stories, relatable pain points, aspirational takes.
  Each slide = 8-15 words MAX. Short. Punchy. Swiped in 2 seconds.
- Slide 5: Subtle transition. Personally bridge the content theme to a behaviour
  change ("I started doing X", "I found a way to fix this", "one thing changed").
  Still NO app name.
- Slide 6: Natural, non-cringe app mention. One specific CTA. No hype language.
  Format: "[what changed for you] → [CTA like 'link in bio' or 'search AppName']"

Rules:
- NEVER use the word "app" on slides 1-5
- NEVER say "sponsored", "ad", "check out", "amazing product"
- Vary the hook formats across posts (don't repeat the same opener)
- Write in casual first-person or declarative style
- Keep it real, specific, and slightly opinionated
"""

HOOK_FORMATS = [
    "things nobody tells you about {topic}",
    "POV: you finally figured out {topic}",
    "{number} reasons you're struggling with {topic}",
    "the honest truth about {topic}",
    "what they don't tell you about {topic}",
    "stop doing this if you want to {outcome}",
    "this changed how I think about {topic}",
    "I wish I knew this before {topic}",
    "{number} things that happen when you {action}",
    "why most people fail at {topic}",
    "the {topic} advice nobody gives you",
    "hot take: {niche} people need to hear this",
]


class CaptionGenerator:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.client = OpenAI(api_key=get_api_key("OPENAI_API_KEY"))
        self.app_name: str = config["app"]["name"]
        self.app_desc: str = config["app"]["description"]
        self.niche: str = config["app"].get("niche", "lifestyle")
        self.tagline: str = config["app"].get("tagline", "Download link in bio")
        self.slides_per_post: int = config["content"]["slides_per_post"]
        self.content_slides: int = config["content"]["content_slides"]
        self.captions_path = BASE_DIR / "data" / "competitor_captions.txt"
        self.out_path = BASE_DIR / "generated" / "captions.json"

    # ------------------------------------------------------------------

    def _load_competitor_examples(self) -> str:
        if not self.captions_path.exists():
            return "(no competitor examples provided)"
        text = self.captions_path.read_text(encoding="utf-8")
        # Strip comment lines
        lines = [l for l in text.splitlines() if not l.startswith("#")]
        return "\n".join(lines).strip() or "(no competitor examples provided)"

    # ------------------------------------------------------------------

    def _build_user_prompt(self, count: int, competitor_examples: str) -> str:
        return f"""Generate {count} unique TikTok slideshow post sets.

APP INFO:
- App name: {self.app_name}
- What it does: {self.app_desc}
- Niche/topic: {self.niche}
- CTA text: {self.tagline}

COMPETITOR STYLE EXAMPLES (copy the style, not the words):
{competitor_examples}

OUTPUT FORMAT — return a JSON array only, no other text:
[
  {{
    "post_id": "post_001",
    "hook_angle": "brief description of the angle",
    "slides": [
      {{"slide": 1, "text": "slide 1 text here"}},
      {{"slide": 2, "text": "slide 2 text here"}},
      {{"slide": 3, "text": "slide 3 text here"}},
      {{"slide": 4, "text": "slide 4 text here"}},
      {{"slide": 5, "text": "subtle transition text here"}},
      {{"slide": 6, "text": "app mention + CTA here"}}
    ],
    "tiktok_caption": "The post caption (200+ chars with relevant keywords and {len(self.config['content']['hashtags'])} hashtags)",
    "hashtags": ["#fyp", "#yourtag"]
  }},
  ...
]

Remember:
- Each post should feel completely different from the others
- Mix up hook formats: curiosity, POV, numbered list, hot take, etc.
- Slides 1-4 are PURE content — no product mention whatsoever
- Slide 5 bridges to the behaviour/solution naturally
- Slide 6 mentions {self.app_name} once, ends with: {self.tagline}
- tiktok_caption must be 200+ characters and include the hashtags: {' '.join(self.config['content']['hashtags'])}
"""

    # ------------------------------------------------------------------

    def generate(self, count: int) -> list[dict]:
        """Generate `count` post caption sets. Returns list of post dicts."""
        competitor_examples = self._load_competitor_examples()

        console.print(f"[cyan]Generating {count} post caption sets...[/cyan]")

        # Generate in batches of 20 to avoid token limits
        all_posts: list[dict] = []
        batch_size = 20
        batch_num = 0

        while len(all_posts) < count:
            remaining = count - len(all_posts)
            batch_count = min(batch_size, remaining)
            batch_num += 1

            console.print(f"  [dim]Batch {batch_num}: generating {batch_count} posts...[/dim]")

            try:
                response = self.client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": self._build_user_prompt(batch_count, competitor_examples),
                        },
                    ],
                    max_tokens=4096,
                    temperature=0.9,
                    response_format={"type": "json_object"},
                )

                raw = response.choices[0].message.content.strip()

                # The model might wrap the array in a root key
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    posts = parsed
                elif isinstance(parsed, dict):
                    # Find the first list value
                    posts = next((v for v in parsed.values() if isinstance(v, list)), [])
                else:
                    posts = []

                # Re-number post IDs to be globally unique
                for post in posts:
                    idx = len(all_posts) + 1
                    post["post_id"] = f"post_{idx:04d}"

                all_posts.extend(posts)
                console.print(f"  [green]✓[/green] {len(posts)} posts generated (total: {len(all_posts)})")

            except Exception as exc:
                console.print(f"  [red]Error in batch {batch_num}: {exc}[/red]")
                # Continue to next batch rather than failing entirely
                continue

        # Trim to exact count
        all_posts = all_posts[:count]

        # Save
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.out_path.write_text(json.dumps(all_posts, indent=2, ensure_ascii=False), encoding="utf-8")
        console.print(f"\n[bold green]✓ Saved {len(all_posts)} caption sets → generated/captions.json[/bold green]")

        return all_posts

    # ------------------------------------------------------------------

    def load_existing(self) -> list[dict]:
        """Load previously generated captions from disk."""
        if not self.out_path.exists():
            return []
        return json.loads(self.out_path.read_text(encoding="utf-8"))
