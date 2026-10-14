"""
Schedule posts using the SocialClaw CLI.

Workflow per post:
  1. Upload each slide image → get hosted public URL
  2. Build schedule JSON entry
  3. Write a batch schedule file
  4. socialclaw validate -f schedule.json
  5. socialclaw apply  -f schedule.json
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from rich.console import Console
from rich.table import Table

from .config import BASE_DIR

console = Console()


def _run_socialclaw(args: list[str]) -> dict:
    """Run a socialclaw CLI command, parse JSON output."""
    cmd = ["socialclaw"] + args + ["--json"]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            console.print(f"[red]socialclaw error: {result.stderr or result.stdout}[/red]")
            return {"error": result.stderr or result.stdout}

        return json.loads(result.stdout) if result.stdout.strip() else {}

    except FileNotFoundError:
        console.print(
            "[red]socialclaw is not installed. Run: npm install -g socialclaw[/red]"
        )
        sys.exit(1)
    except subprocess.TimeoutExpired:
        console.print("[red]socialclaw command timed out[/red]")
        return {"error": "timeout"}
    except json.JSONDecodeError as exc:
        console.print(f"[red]Failed to parse socialclaw output: {exc}[/red]")
        return {"error": str(exc)}


def _upload_asset(file_path: Path) -> str | None:
    """Upload one file to SocialClaw hosting. Returns the public URL."""
    console.print(f"  [dim]Uploading {file_path.name}...[/dim]", end=" ")
    result = _run_socialclaw(["assets", "upload", "--file", str(file_path)])

    # The CLI returns something like {"url": "...", "publicUrl": "..."} 
    url = result.get("publicUrl") or result.get("url") or result.get("deliveryUrl")
    if url:
        console.print(f"[green]✓[/green]")
    else:
        console.print(f"[red]✗ (no URL in response)[/red]")
    return url


def _build_post_entry(
    post: dict,
    account_handle: str,
    scheduled_at: str,
    asset_urls: list[str],
) -> dict:
    """Build a single SocialClaw schedule entry for a TikTok photo gallery post."""
    caption = post.get("tiktok_caption", "")
    if not caption:
        # Fallback: join hashtags
        tags = " ".join(post.get("hashtags", []))
        caption = f"{tags}"

    return {
        "account": f"tiktok:{account_handle}",
        "provider": "tiktok",
        "description": caption,
        "status": "scheduled",
        "publishAt": scheduled_at,
        "settings": {
            "autoAddMusic": True,
            "photoCoverIndex": 0,
            "privacyLevel": "PUBLIC_TO_EVERYONE",
            "commentEnabled": True,
            "duetEnabled": False,
            "stitchEnabled": False,
        },
        "assets": [{"url": u} for u in asset_urls],
    }


class Scheduler:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.accounts: list[str] = [a["handle"] for a in config["accounts"]]
        self.posts_per_day: int = config["posting"]["posts_per_day"]
        self.post_times: list[str] = config["posting"]["post_times"]
        self.start_date_str: str = config["posting"]["start_date"]
        self.days: int = config["posting"]["days_to_schedule"]
        self.timezone: str = config["posting"].get("timezone", "UTC")
        self.schedules_dir = BASE_DIR / "schedules"
        self.posts_dir = BASE_DIR / "generated" / "posts"

    # ------------------------------------------------------------------

    def _posting_slots(self) -> list[datetime]:
        """Generate a list of datetime slots across all accounts."""
        tz = ZoneInfo(self.timezone)
        start = datetime.strptime(self.start_date_str, "%Y-%m-%d").replace(tzinfo=tz)
        slots: list[datetime] = []

        for day_offset in range(self.days):
            day = start + timedelta(days=day_offset)
            for time_str in self.post_times[: self.posts_per_day]:
                h, m = map(int, time_str.split(":"))
                slot = day.replace(hour=h, minute=m, second=0, microsecond=0)
                slots.append(slot)

        return slots

    # ------------------------------------------------------------------

    def schedule_all(self, posts: list[dict], dry_run: bool = False) -> None:
        """
        Upload assets and schedule every post via SocialClaw.

        Args:
            posts: Assembled post metadata list.
            dry_run: If True, write the schedule file but don't call apply.
        """
        slots = self._posting_slots()
        accounts = self.accounts

        # Interleave posts across accounts
        schedule_entries: list[dict] = []
        upload_log: list[dict] = []

        console.print(f"\n[bold cyan]Scheduling {len(posts)} posts across {len(accounts)} account(s)...[/bold cyan]")
        console.print(f"Slots available: {len(slots)}, Posts: {len(posts)}\n")

        for i, post in enumerate(posts):
            slot = slots[i % len(slots)]
            account = accounts[i % len(accounts)]
            slot_iso = slot.isoformat()

            console.print(f"[bold]Post {i+1}/{len(posts)}:[/bold] {post['post_id']} → {account} @ {slot_iso}")

            slide_paths = [Path(p) for p in post.get("slide_image_paths", [])]
            if not slide_paths:
                console.print("  [yellow]No slide images found, skipping[/yellow]")
                continue

            # Upload each slide
            asset_urls: list[str] = []
            for slide_path in slide_paths:
                if not slide_path.exists():
                    console.print(f"  [red]Missing: {slide_path}[/red]")
                    continue
                if dry_run:
                    asset_urls.append(f"https://placeholder.url/{slide_path.name}")
                else:
                    url = _upload_asset(slide_path)
                    if url:
                        asset_urls.append(url)

            if not asset_urls:
                console.print("  [red]No assets uploaded, skipping post[/red]")
                continue

            entry = _build_post_entry(post, account, slot_iso, asset_urls)
            schedule_entries.append(entry)

            upload_log.append({
                "post_id": post["post_id"],
                "account": account,
                "scheduled_at": slot_iso,
                "asset_urls": asset_urls,
            })

            # Update metadata on disk
            meta_path = self.posts_dir / post["post_id"] / "metadata.json"
            if meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                meta["scheduled"] = True
                meta["scheduled_at"] = slot_iso
                meta["account"] = account
                meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")

        # Write the schedule file
        schedule_payload = {"posts": schedule_entries}
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        schedule_file = self.schedules_dir / f"schedule_{timestamp}.json"
        self.schedules_dir.mkdir(parents=True, exist_ok=True)
        schedule_file.write_text(json.dumps(schedule_payload, indent=2, ensure_ascii=False), encoding="utf-8")
        console.print(f"\n[dim]Schedule file: {schedule_file}[/dim]")

        # Also save upload log
        log_file = self.schedules_dir / f"upload_log_{timestamp}.json"
        log_file.write_text(json.dumps(upload_log, indent=2, ensure_ascii=False), encoding="utf-8")

        if dry_run:
            console.print(
                f"\n[yellow]DRY RUN — schedule file written but not applied.[/yellow]\n"
                f"To apply manually:\n"
                f"  socialclaw validate -f {schedule_file}\n"
                f"  socialclaw apply    -f {schedule_file}\n"
            )
            return

        # Validate then apply
        console.print("\n[cyan]Validating schedule...[/cyan]")
        val = _run_socialclaw(["validate", "-f", str(schedule_file)])
        if val.get("error"):
            console.print(f"[red]Validation failed: {val}[/red]")
            console.print(f"You can try manually: socialclaw apply -f {schedule_file}")
            return

        console.print("[green]✓ Validation passed[/green]")
        console.print("[cyan]Applying schedule (publishing)...[/cyan]")

        apply_key = f"batch_{timestamp}"
        result = _run_socialclaw(["apply", "-f", str(schedule_file), "--idempotency-key", apply_key])

        if result.get("error"):
            console.print(f"[red]Apply failed: {result}[/red]")
            console.print(f"Retry manually: socialclaw apply -f {schedule_file}")
        else:
            console.print(f"\n[bold green]✓ All {len(schedule_entries)} posts scheduled successfully![/bold green]")
            self._print_summary_table(upload_log)

    # ------------------------------------------------------------------

    def _print_summary_table(self, log: list[dict]) -> None:
        table = Table(title="Scheduled Posts", show_header=True, header_style="bold cyan")
        table.add_column("#", style="dim", width=4)
        table.add_column("Post ID")
        table.add_column("Account")
        table.add_column("Scheduled At")
        table.add_column("Slides", justify="right")

        for i, entry in enumerate(log, 1):
            table.add_row(
                str(i),
                entry["post_id"],
                entry["account"],
                entry["scheduled_at"],
                str(len(entry["asset_urls"])),
            )

        console.print(table)
