#!/usr/bin/env python3
"""
TikTok Marketing Bot
====================
Automate months of TikTok slideshow content for your app.

Usage:
  python main.py setup          # First-time setup wizard
  python main.py generate-images
  python main.py generate-captions
  python main.py create-slides
  python main.py schedule       # Upload + schedule via SocialClaw
  python main.py run-all        # Full pipeline in one shot
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import click
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

# Load .env early so all sub-imports can access env vars
load_dotenv(Path(__file__).parent / ".env")

from src.config import BASE_DIR, ensure_dirs, load_config
from src.caption_generator import CaptionGenerator
from src.image_generator import ImageGenerator
from src.post_assembler import PostAssembler
from src.scheduler import Scheduler
from src.slide_creator import SlideCreator

console = Console()

BANNER = """
[bold cyan]  TikTok Marketing Bot[/bold cyan]
[dim]  Automate months of viral TikTok slideshow content for your app[/dim]
"""


@click.group()
def cli():
    """TikTok Marketing Bot — automate months of slideshow content."""
    console.print(BANNER)
    ensure_dirs()


# ======================================================================
# SETUP
# ======================================================================

@cli.command()
def setup():
    """Interactive first-time setup wizard."""
    console.print(Panel("[bold]First-time setup[/bold]", style="cyan"))

    steps = [
        ("1. API Keys", "Copy .env.example → .env and fill in OPENAI_API_KEY and SOCIALCLAW_API_KEY"),
        ("2. Config", "Open config.yaml and fill in your app name, niche, TikTok accounts, and posting schedule"),
        ("3. Reference Images", "Drop Pinterest/Google lifestyle images into reference_images/slide_1/ through slide_6/"),
        ("4. Competitor Captions", "Paste TikTok competitor slide text into data/competitor_captions.txt"),
        ("5. Install SocialClaw", "Run: npm install -g socialclaw"),
        ("6. Connect TikTok", "Run: socialclaw login  then  socialclaw accounts connect --provider tiktok --open"),
        ("7. Generate Content", "Run: python main.py run-all"),
    ]

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("Step", style="bold cyan")
    table.add_column("Action")
    for step, action in steps:
        table.add_row(step, action)

    console.print(table)

    # Check what's already done
    console.print("\n[bold]Status check:[/bold]")
    _check = lambda p, msg: console.print(
        f"  {'[green]✓[/green]' if p else '[red]✗[/red]'} {msg}"
    )

    _check((BASE_DIR / ".env").exists(), ".env file exists")
    _check(bool(os.getenv("OPENAI_API_KEY")), "OPENAI_API_KEY is set")
    _check(bool(os.getenv("SOCIALCLAW_API_KEY")), "SOCIALCLAW_API_KEY is set")
    _check(
        any((BASE_DIR / "reference_images").rglob("*.jpg")),
        "Reference images found in reference_images/"
    )
    _check(
        (BASE_DIR / "data" / "competitor_captions.txt").exists(),
        "competitor_captions.txt exists"
    )

    # Check socialclaw
    try:
        subprocess.run(["socialclaw", "--version"], capture_output=True, timeout=10)
        _check(True, "socialclaw CLI is installed")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        _check(False, "socialclaw CLI is installed (run: npm install -g socialclaw)")

    console.print("\n[dim]Run 'python main.py run-all' when you're ready.[/dim]")


# ======================================================================
# GENERATE IMAGES
# ======================================================================

@cli.command("generate-images")
@click.option("--count", "-n", default=None, type=int,
              help="Images to generate per slide type (default: from config)")
def generate_images(count):
    """Generate DALL-E 3 image variations for each slide position."""
    config = load_config()
    gen = ImageGenerator(config)

    count = count or config["content"].get("images_per_slide_type", 20)
    console.print(Panel(
        f"Generating [bold]{count}[/bold] images × {config['content']['slides_per_post']} slide types"
        f" = [bold]{count * config['content']['slides_per_post']}[/bold] total images",
        title="Image Generation",
        style="cyan",
    ))

    gen.run(count_per_slide=count)


# ======================================================================
# GENERATE CAPTIONS
# ======================================================================

@cli.command("generate-captions")
@click.option("--count", "-n", default=None, type=int,
              help="Number of post caption sets to generate")
def generate_captions(count):
    """Generate AI-powered slide captions for all posts."""
    config = load_config()
    gen = CaptionGenerator(config)

    if count is None:
        days = config["posting"]["days_to_schedule"]
        ppd = config["posting"]["posts_per_day"]
        count = days * ppd * len(config["accounts"])

    console.print(Panel(
        f"Generating [bold]{count}[/bold] post caption sets\n"
        f"Format: content → content → content → content → warmup → app push",
        title="Caption Generation",
        style="cyan",
    ))

    gen.generate(count)


# ======================================================================
# CREATE SLIDES
# ======================================================================

@cli.command("create-slides")
def create_slides():
    """Overlay text on images to create TikTok-ready slide images."""
    config = load_config()

    captions_path = BASE_DIR / "generated" / "captions.json"
    if not captions_path.exists():
        console.print("[red]No captions found. Run 'generate-captions' first.[/red]")
        sys.exit(1)

    caption_sets = json.loads(captions_path.read_text(encoding="utf-8"))

    console.print(Panel(
        f"Creating slides for [bold]{len(caption_sets)}[/bold] posts\n"
        f"Output: 1080×1920 JPEGs in generated/slides/",
        title="Slide Creation",
        style="cyan",
    ))

    assembler = PostAssembler(config)
    assembler.assemble(caption_sets)


# ======================================================================
# SCHEDULE
# ======================================================================

@cli.command()
@click.option("--dry-run", is_flag=True, default=False,
              help="Write schedule file but don't call socialclaw apply")
@click.option("--unscheduled-only", is_flag=True, default=True,
              help="Only schedule posts not yet scheduled")
def schedule(dry_run, unscheduled_only):
    """Upload images to SocialClaw and schedule all posts."""
    config = load_config()
    sched = Scheduler(config)
    assembler = PostAssembler(config)

    all_posts = assembler.load_all_posts()
    if not all_posts:
        console.print("[red]No assembled posts found. Run 'create-slides' first.[/red]")
        sys.exit(1)

    posts_to_schedule = (
        [p for p in all_posts if not p.get("scheduled")]
        if unscheduled_only
        else all_posts
    )

    console.print(Panel(
        f"[bold]{len(posts_to_schedule)}[/bold] posts to schedule\n"
        f"Accounts: {', '.join(a['handle'] for a in config['accounts'])}\n"
        f"{'[yellow]DRY RUN MODE[/yellow]' if dry_run else ''}",
        title="Scheduling",
        style="cyan",
    ))

    sched.schedule_all(posts_to_schedule, dry_run=dry_run)


# ======================================================================
# RUN ALL
# ======================================================================

@cli.command("run-all")
@click.option("--image-count", "-i", default=None, type=int,
              help="Images per slide type (default: from config)")
@click.option("--dry-run", is_flag=True, default=False,
              help="Don't actually schedule; just build everything")
@click.pass_context
def run_all(ctx, image_count, dry_run):
    """Run the complete pipeline end-to-end."""
    config = load_config()

    days = config["posting"]["days_to_schedule"]
    ppd = config["posting"]["posts_per_day"]
    accounts = config["accounts"]
    total_posts = days * ppd * len(accounts)

    console.print(Panel(
        f"[bold green]Full pipeline[/bold green]\n\n"
        f"  App:      [bold]{config['app']['name']}[/bold]\n"
        f"  Niche:    {config['app']['niche']}\n"
        f"  Accounts: {len(accounts)} TikTok account(s)\n"
        f"  Posts:    {total_posts} over {days} days ({ppd}/day)\n"
        f"  Slides:   {config['content']['slides_per_post']} per post\n",
        title="TikTok Marketing Bot — Run All",
        style="bold cyan",
    ))

    # Step 1: Generate images
    console.rule("[bold cyan]Step 1/4 — Generate Images[/bold cyan]")
    img_gen = ImageGenerator(config)
    cnt = image_count or config["content"].get("images_per_slide_type", 20)
    img_gen.run(count_per_slide=cnt)

    # Step 2: Generate captions
    console.rule("[bold cyan]Step 2/4 — Generate Captions[/bold cyan]")
    cap_gen = CaptionGenerator(config)
    caption_sets = cap_gen.generate(total_posts)

    # Step 3: Assemble posts (create slide images)
    console.rule("[bold cyan]Step 3/4 — Create Slides[/bold cyan]")
    assembler = PostAssembler(config)
    assembled = assembler.assemble(caption_sets)

    # Step 4: Schedule
    console.rule("[bold cyan]Step 4/4 — Schedule via SocialClaw[/bold cyan]")
    sched = Scheduler(config)
    sched.schedule_all(assembled, dry_run=dry_run)

    console.print(Panel(
        f"[bold green]Done![/bold green]\n\n"
        f"  ✓ {len(assembled)} posts created and scheduled\n"
        f"  ✓ {days} days of content ({ppd} posts/day)\n\n"
        f"Check your SocialClaw dashboard: [link]https://getsocialclaw.com/dashboard[/link]",
        title="Complete",
        style="bold green",
    ))


# ======================================================================
# STATUS
# ======================================================================

@cli.command()
def status():
    """Show current pipeline status (what's been generated / scheduled)."""
    config = load_config()

    def count_files(path: Path, pattern: str) -> int:
        return len(list(path.rglob(pattern))) if path.exists() else 0

    ref_imgs = count_files(BASE_DIR / "reference_images", "*.jpg") + \
               count_files(BASE_DIR / "reference_images", "*.png")
    gen_imgs = count_files(BASE_DIR / "generated" / "images", "*.jpg")
    gen_slides = count_files(BASE_DIR / "generated" / "slides", "*.jpg")

    captions_path = BASE_DIR / "generated" / "captions.json"
    cap_count = 0
    if captions_path.exists():
        try:
            cap_count = len(json.loads(captions_path.read_text(encoding="utf-8")))
        except Exception:
            pass

    post_dirs = list((BASE_DIR / "generated" / "posts").glob("*/metadata.json")) \
        if (BASE_DIR / "generated" / "posts").exists() else []
    scheduled = sum(
        1 for p in post_dirs
        if json.loads(Path(p).read_text(encoding="utf-8")).get("scheduled")
    )

    table = Table(title="Pipeline Status", show_header=True, header_style="bold")
    table.add_column("Stage", style="cyan")
    table.add_column("Count", justify="right")
    table.add_column("Status")

    def row(label, count, ok_threshold=1):
        status = "[green]✓[/green]" if count >= ok_threshold else "[yellow]pending[/yellow]"
        table.add_row(label, str(count), status)

    row("Reference images", ref_imgs)
    row("Generated images", gen_imgs, ok_threshold=6)
    row("Caption sets", cap_count)
    row("Posts assembled", len(post_dirs))
    row("Posts scheduled", scheduled)

    console.print(table)

    days = config["posting"]["days_to_schedule"]
    ppd = config["posting"]["posts_per_day"]
    target = days * ppd * len(config["accounts"])
    console.print(f"\n[dim]Target: {target} posts ({days} days × {ppd}/day × {len(config['accounts'])} account(s))[/dim]")


# ======================================================================
# ENTRY POINT
# ======================================================================

if __name__ == "__main__":
    cli()
