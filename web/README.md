# Growth OS

AI Growth OS for creators — research trends, generate viral carousels, manage Image Packs, and publish from one multi-project workspace.

## Architecture

```
User (Supabase Auth)
  └── WorkspaceMember (Owner | Admin | Editor | Viewer)
        └── Workspace
              └── Projects (one per app)
                    ├── Connected Accounts
                    ├── Posts / Library / Image Packs
                    ├── Competitors / Experiments
                    └── Analytics
```

- **Auth:** Supabase Auth (email/password, Google when configured)
- **App data:** Prisma → SQLite (local) or Supabase Postgres (production)
- **AI:** Groq / OpenAI via logged completion helpers
- **TikTok:** Public sync + optional Content Posting API (OAuth `video.publish`)

## App surfaces

| Area | Routes |
|------|--------|
| Marketing | `/`, `/privacy`, `/terms`, `/contact`, `/status` |
| Auth | `/login`, `/signup`, `/auth/callback`, `/auth/reset` |
| Product | `/agent`, `/chat`, `/generate`, `/library`, `/analytics`, … |
| Entry | `/dashboard` → `/agent` when signed in |

## Local development

The step-by-step guide for accounts, keys, the database, and deploy is [SETUP.md](../SETUP.md).

```bash
cd web
cp .env.example .env
# Fill the values in .env. For a first look without Supabase, set AUTH_DEV_BYPASS=1
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Continue locally** on `/login` when Supabase is not configured.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — `prisma generate && next build`
- `npm run db:migrate` — Prisma migrate
- `npm run db:seed` — seed workspace (empty metrics)

## Licence

Proprietary — all rights reserved.
