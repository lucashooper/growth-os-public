# Growth OS

The product you run day to day is the Next.js app in [`web/`](web/). Start with [SETUP.md](SETUP.md): it lists every account, key, and command needed to run Growth OS on your own Supabase project and host.

The Python tools in this folder are an older slideshow pipeline (images, captions, SocialClaw scheduling). They are optional. Their keys live in the root `.env`, separate from `web/.env`.

# TikTok Marketing Bot

Automate months of viral TikTok slideshow content for your app. Built for the
**content → content → content → content → ad warmup → app push** format that's
driving $10k+/mo for app founders.

---

## What this does

- Generates lifestyle/aesthetic background images using DALL-E 3
- Writes slide-by-slide captions using GPT-4o following the viral format
- Overlays text on images in TikTok-native 9:16 (1080×1920) format
- Schedules posts across multiple TikTok accounts via SocialClaw
- One session → 2 months of content, fully automated

**Content format per post (6 slides):**

| Slide | Type | Example |
|-------|------|---------|
| 1 | Hook | "5 things nobody tells you about being productive" |
| 2 | Content | "Your brain forgets 70% of ideas within an hour" |
| 3 | Content | "Writing things down isn't optional. It's survival." |
| 4 | Content | "The people who move fast capture everything" |
| 5 | Ad warmup | "I stopped trying to remember and started writing it all down" |
| 6 | App push | "This app made that effortless → link in bio" |

---

## Requirements

- **Python 3.11+**
- **Node.js** (for socialclaw)
- **OpenAI API key** (for DALL-E 3 image generation + GPT-4o captions)
- **SocialClaw account + API key** (for scheduling to TikTok)

---

## Setup (one time)

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Install SocialClaw

```bash
npm install -g socialclaw
```

### 3. Set up API keys

```bash
copy .env.example .env
```

Open `.env` and fill in:
- `OPENAI_API_KEY` — from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- `SOCIALCLAW_API_KEY` — from [getsocialclaw.com/dashboard](https://getsocialclaw.com/dashboard)

### 4. Configure your app

Open `config.yaml` and fill in:
- Your app name, description, and niche
- Your TikTok account handle(s)
- Posting schedule (days, times, posts per day)

```yaml
app:
  name: "NoteSnap"
  description: "Instantly capture and organise your ideas"
  niche: "productivity"
  tagline: "Download link in bio"

accounts:
  - handle: "@myapp_account"
```

### 5. Connect your TikTok account to SocialClaw

```bash
socialclaw login
socialclaw accounts connect --provider tiktok --open
```

A browser window opens. Log in with your TikTok account.

---

## The 4-6 hour content session

### Hour 0-1: Research competitors

Search your niche on TikTok (e.g. "note taking app", "budget tracker"). Browse
top posts and copy the slide text into `data/competitor_captions.txt`.

Separate each post with `---`. More examples = better AI output.

### Hour 1-3: Find reference images on Pinterest

Search for lifestyle/aesthetic images that match your niche. Download 5-10 images
for each slide position:

```
reference_images/
  slide_1/    ← Hook visuals (high contrast, eye-catching)
  slide_2/    ← Content visuals (lifestyle, aspirational)
  slide_3/    ← Content visuals (moody, atmospheric)
  slide_4/    ← Content visuals (bright, uplifting)
  slide_5/    ← Transition visuals (calm, minimal)
  slide_6/    ← CTA visuals (warm, professional)
```

Name the files anything you like (e.g. `tokyo_cafe.jpg`).

**No reference images?** That's fine — the bot generates images from your niche
description automatically. Skip this step and run directly.

### Hour 3-4: Generate image variations

The bot analyses your reference images and generates 100+ similar variations using
DALL-E 3, so you avoid copyright issues and have unlimited fresh content.

```bash
python main.py generate-images
```

This creates `generated/images/slide_1/`, `slide_2/`, etc.

### Hour 4-5: Generate captions + build slides

```bash
python main.py generate-captions
python main.py create-slides
```

This writes `generated/captions.json` (all post captions) and then overlays
the text on the images to create `generated/slides/post_0001/slide_01.jpg` etc.

### Hour 5-6: Schedule everything

```bash
python main.py schedule
```

This uploads every slide image to SocialClaw hosting and schedules all posts
across your TikTok accounts at the times specified in `config.yaml`.

---

## One command to do it all

```bash
python main.py run-all
```

Runs all four steps in sequence. Use `--dry-run` to build everything without
actually publishing (useful for review first).

```bash
python main.py run-all --dry-run
```

---

## All commands

| Command | What it does |
|---------|-------------|
| `python main.py setup` | Show setup checklist + status |
| `python main.py status` | Show what's been generated / scheduled |
| `python main.py generate-images` | Generate DALL-E 3 image variations |
| `python main.py generate-captions` | Generate slide captions with GPT-4o |
| `python main.py create-slides` | Overlay text on images |
| `python main.py schedule` | Upload + schedule via SocialClaw |
| `python main.py run-all` | Full pipeline in one shot |

---

## How the content stays fresh

The bot generates variations, not repeats:

- **Images**: Each run of DALL-E 3 produces a unique interpretation of the prompt,
  even with the same reference image.
- **Captions**: GPT-4o generates dozens of different hook angles, story frames,
  and niche takes — all in the same viral format.
- **Image pairing**: Posts cycle through the image pool so the same background
  is rarely repeated back-to-back.

---

## Multiple accounts

Add more handles to `config.yaml`:

```yaml
accounts:
  - handle: "@myapp_v1"
  - handle: "@myapp_v2"
  - handle: "@myapp_niche"
```

The bot interleaves posts across all accounts automatically.

---

## Cost estimate

| Service | Usage | Approx cost |
|---------|-------|-------------|
| DALL-E 3 | 120 images (6 types × 20) | ~$3.60 |
| GPT-4o | 120 post caption sets | ~$2.00 |
| SocialClaw | Monthly plan | ~$19/mo |
| **Total** | 2 months of content | **~$25** |

---

## Troubleshooting

**`socialclaw: command not found`**
```bash
npm install -g socialclaw
```

**`Missing environment variable: OPENAI_API_KEY`**
- Make sure `.env` exists (copy from `.env.example`)
- Make sure the key is set in `.env` (not just the example file)

**`picture_size_check_failed` from TikTok**
- Images must be 1080×1920 JPEG — the bot handles this automatically
- If it happens, reconcile with: `socialclaw posts reconcile --post-id <id>`

**Captions feel generic**
- Add more competitor caption examples to `data/competitor_captions.txt`
- Make your `app.description` in `config.yaml` more specific

**Images don't exist for a slide type**
- Either drop images in the matching `reference_images/slide_N/` folder,
  or the bot will generate from niche prompts automatically

---

## Project structure

```
Marketing Bot/
├── main.py                  ← Main CLI
├── config.yaml              ← Your settings
├── .env                     ← API keys (never share)
├── requirements.txt
├── src/
│   ├── config.py            ← Config loader
│   ├── image_generator.py   ← DALL-E 3 image generation
│   ├── caption_generator.py ← GPT-4o caption writing
│   ├── slide_creator.py     ← Pillow text overlay
│   ├── post_assembler.py    ← Combines slides into posts
│   └── scheduler.py         ← SocialClaw integration
├── reference_images/
│   ├── slide_1/             ← Drop Pinterest images here
│   └── ...
├── generated/
│   ├── images/              ← DALL-E generated backgrounds
│   ├── slides/              ← Text-overlaid slide images
│   └── posts/               ← Complete post packages + metadata
├── data/
│   └── competitor_captions.txt
└── schedules/               ← SocialClaw schedule JSON files
```
