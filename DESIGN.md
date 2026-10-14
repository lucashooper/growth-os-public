# Design System

## Product

Multi-project growth OS (placeholder name in UI: **Workspace**). Dark-only product register. Senior growth strategist tone.

## Visual Theme

**Mood:** Midnight operator desk — mineral green signal light, quiet surfaces, no noise.

**Strategy:** Restrained — near-black surfaces + one moss primary ≤10% of chrome. Accent used for status / wins only.

## Color (OKLCH)

```css
:root {
  --bg: oklch(0.09 0 0);
  --surface: oklch(0.13 0 0);
  --surface-2: oklch(0.16 0 0);
  --border: oklch(0.22 0 0);
  --ink: oklch(0.96 0 0);
  --muted: oklch(0.62 0 0);
  --primary: oklch(0.72 0.12 160);
  --primary-fg: oklch(0.12 0 0);
  --accent: oklch(0.78 0.08 210);
  --danger: oklch(0.65 0.18 25);
  --warning: oklch(0.78 0.14 85);
  --success: oklch(0.72 0.12 160);
}
```

Primary hue anchored to seed 160° (moss). No purple. No neon. No warm cream.

## Typography

- **UI / body:** Geist Sans (or Inter fallback) — one family, product scale
- Scale: 12 / 13 / 14 / 16 / 20 / 24 / 32
- Tracking: headings -0.02em max; never below -0.04em
- Data / mono: Geist Mono for IDs, handles, confidence %

## Layout

- Left sidebar ~240px, collapsible
- Content max-width ~1280px with generous padding (24–40px)
- Cards: radius 12–14px, 1px border, no heavy drop shadows
- Project switcher in sidebar header (Vercel/Linear pattern)

## Motion

- 150–220ms ease-out for state changes
- Subtle page content fade/slide on route change
- Respect `prefers-reduced-motion`
- No orchestrated hero load sequences

## Components

- Rounded cards, sparse chrome
- Status pills: Running / Winner / Draft / Scheduled
- Large generate CTA uses primary fill + white/near-black text per contrast rules
- Empty states teach the next action

## References

Linear · Vercel · Stripe Dashboard · Arc · Notion AI
