"""Load and validate the bot configuration."""

import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from rich.console import Console

console = Console()

BASE_DIR = Path(__file__).parent.parent


def load_config() -> dict[str, Any]:
    """Load config.yaml and merge with env vars."""
    load_dotenv(BASE_DIR / ".env")

    config_path = BASE_DIR / "config.yaml"
    if not config_path.exists():
        console.print("[red]config.yaml not found. Copy config.yaml.example and fill it in.[/red]")
        raise SystemExit(1)

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    return config


def get_api_key(name: str) -> str:
    """Return an env var or raise a helpful error."""
    value = os.getenv(name)
    if not value:
        console.print(
            f"[red]Missing environment variable: {name}\n"
            f"Copy .env.example → .env and fill in your keys.[/red]"
        )
        raise SystemExit(1)
    return value


def ensure_dirs() -> None:
    """Make sure all working directories exist."""
    dirs = [
        BASE_DIR / "reference_images",
        BASE_DIR / "generated" / "images",
        BASE_DIR / "generated" / "slides",
        BASE_DIR / "generated" / "posts",
        BASE_DIR / "data",
        BASE_DIR / "schedules",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
