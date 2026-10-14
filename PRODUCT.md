# Product

## Register

product

## Users

Solo founders and small growth teams who run TikTok (and later multi-platform) content systems for one or more consumer apps. They open this workspace to check performance, approve AI-proposed work, run experiments, and keep a multi-week content queue full — not to design slides by hand every day.

Primary user: a founder or small team shipping one or more consumer apps from a single growth workspace.

## Product Purpose

An AI-first multi-project growth operating system for automated short-form marketing.

It is not a single-app marketing bot and not a metrics dashboard first. The home surface is the AI Agent daily briefing. Each project has multiple connected TikTok accounts (username-only today; OAuth later), plus analytics, content library, generator, queue, and experiments. Future platforms: Instagram, YouTube, X.

AI is provider-abstracted (Groq default; also OpenAI, Gemini, Claude, Ollama). Keys stay server-side in `.env`.

Success looks like: open the app → read the briefing → approve recommended actions → generate into a live preview → leave with a full queue. Eventually the agent runs autonomously and only asks for approval.

## Brand Personality

Precise · Calm · Insightful · Autonomous

Voice of a senior growth strategist: confident, concise, highly analytical. Surfaces patterns and opportunities before being asked. Never chatty, never hype.

References for feel: Linear, Vercel, Notion AI, Stripe, Arc Browser — whitespace, quiet confidence, one accent, Apple-level polish.

## Anti-references

- Generic AI glow / purple neon / cyberpunk aesthetics
- Cluttered metric walls and marketplace/community layouts
- Dense admin panels with no hierarchy
- Chatbot-style AI that waits to be prompted instead of leading with analysis

## Design Principles

1. **Platform first** — Multi-project is architectural, not a badge. Every surface is scoped to the active project, with a clear switcher.
2. **Strategist, not chatbot** — The AI Agent leads with findings and recommendations; conversation is secondary.
3. **Show the signal** — Prefer one clear insight over ten equal metrics. Whitespace is part of the product.
4. **Earn autonomy** — UI should make approve / reject of agent work feel natural; mock data must feel real enough to trust later.
5. **Quiet luxury** — One primary accent, rounded cards, smooth motion, dark-only. Familiar product patterns over invented chrome.

## Accessibility & Inclusion

- WCAG AA contrast on dark surfaces
- Respect `prefers-reduced-motion`
- Keyboard-reachable navigation and focus rings
- Don't rely on color alone for experiment winners / status
