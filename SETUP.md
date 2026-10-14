# Set up Growth OS

Growth OS is a private workspace for short-form marketing. You sign in, keep one project per app, connect TikTok accounts, and use the AI agent to research, draft carousels, queue posts, and publish. Billing, outreach email, and competitor research are optional.

This guide is for someone running it on their own accounts. You do not need the original operator’s keys, domain, or database.

The app lives in `web/`. The Python files in the repository root are an older slideshow helper. Skip them until the website is running.

## What to install

Install these before you start:

- [Node.js 22 or newer](https://nodejs.org/) (the app will not build on older Node)
- Git
- A browser

Optional, only for the Python helper at the end:

- Python 3.11 or newer
- [SocialClaw](https://getsocialclaw.com/) if you want that helper to schedule TikTok posts

## Accounts to create

Create these yourself. Use your own email. Write the keys into `web/.env` and nowhere else.

| Service | Why | Where to open it | Required? |
| --- | --- | --- | --- |
| [Supabase](https://supabase.com/dashboard) | Login, and the production database | New project | Yes, for a real sign-in |
| [Groq](https://console.groq.com/keys) | Default AI (captions, agent, chat) | API keys | Yes, if you want the agent |
| [Netlify](https://app.netlify.com/) | Hosting that matches `netlify.toml` | New site from Git | Only when you deploy |
| [TikTok for Developers](https://developers.tiktok.com/) | Connect accounts and publish | Create an app, add Login Kit and Content Posting | Only to publish |
| [Stripe](https://dashboard.stripe.com/apikeys) | Paid plans | Products, prices, customer portal, webhook | Only to charge users |
| [Apify](https://console.apify.com/account/integrations) | Refresh TikTok stats on Netlify | Integrations → API token | Only for cloud sync |
| [Resend](https://resend.com/api-keys) | Creator outreach email | API keys, then verify a domain | Only for outreach |
| [Tavily](https://tavily.com) or [Serper](https://serper.dev) | Find creator emails | API keys | Only for discovery |
| [OpenAI](https://platform.openai.com/api-keys) | Alternative AI, and image text reading | API keys | Optional |
| [Google AI Studio](https://aistudio.google.com/apikey) | Gemini, including image text | API keys | Optional |
| [Anthropic](https://console.anthropic.com/settings/keys) | Claude | API keys | Optional |
| [Meta Ad Library API](https://www.facebook.com/ads/library/api) | Competitor ads | Token | Optional |
| [Ollama](https://ollama.com) | AI on your own machine | No key | Optional |

HeyGen, ElevenLabs, and Reel.Farm keys are saved later inside the app (Settings → integrations). They are not environment variables.

## 1. Copy the environment file

From the repository root:

```bash
cd web
cp .env.example .env
```

Open `web/.env` in a text editor. Every secret stays in that file. Do not put keys in the source code.

For a first look on your laptop, with no accounts yet, this is enough:

```bash
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"
AUTH_DEV_BYPASS=1
OWNER_EMAIL=you@example.com
```

`AUTH_DEV_BYPASS=1` skips Supabase and signs you in as `OWNER_EMAIL`. Turn it back to `0` before you deploy. Never deploy with it set to `1`.

## 2. Supabase

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **Project Settings → API**.
3. Copy these into `web/.env`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the long JWT, not the `service_role` key)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
4. Open **Project Settings → Database**.
5. Copy the **Transaction pooler** connection string (port **6543**, host contains `pooler.supabase.com`). Put it in `DATABASE_URL` when you are ready for production. Keep `file:./dev.db` while you are only on your laptop.
6. Add `?pgbouncer=true&connection_limit=5&pool_timeout=10` to that URI if those parameters are missing. The app adds them if you forget, but the pooler host and port 6543 are required. Do not use the direct `db.<ref>.supabase.co` port 5432 host on Netlify.
7. In **Storage**, create a public bucket named `uploads` (or set `SUPABASE_STORAGE_BUCKET` to the name you chose).

### Auth URLs

In **Authentication → URL configuration**, set **Site URL** to your public origin with no trailing slash. Locally that is `http://localhost:3000`. In production it is the same value as `APP_BASE_URL`.

Add these **Redirect URLs** (swap in your real origin):

- `http://localhost:3000/**`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/confirm`
- `https://your-domain.example/**`
- `https://your-domain.example/auth/callback`
- `https://your-domain.example/auth/confirm`

Under **Authentication → Providers**, Email is enough to start. Google is optional: create an OAuth client in Google Cloud and paste the client id and secret into the Google provider. The redirect Supabase shows you must be added in Google Cloud.

### Confirm-email template

Supabase’s default confirm link breaks if the person opens it on a different device. Paste `web/supabase/email-templates/confirm-signup.html` into **Authentication → Email Templates → Confirm signup**.

Before you paste it, replace `you@example.com` in that file with your `NEXT_PUBLIC_CONTACT_EMAIL`. The button already uses `{{ .SiteURL }}`, which Supabase fills from the Site URL above.

## 3. Database tables

From `web/`:

```bash
npm install
npx prisma db push
npm run db:seed
```

`db push` creates the tables from `web/prisma/schema.prisma`. The checked-in SQL migrations were written for SQLite (`DATETIME`). Do not run `prisma migrate deploy` against Supabase; Postgres will reject that SQL. `db push` is the path the app is built around.

On your laptop, `DATABASE_URL` can stay as `file:./dev.db`. The database file is `web/prisma/dev.db`. It is git-ignored.

When `DATABASE_URL` is a Postgres URI, switch the schema provider first, push, then switch it back so local files stay on SQLite:

```bash
cd web
node scripts/prepare-prisma.mjs
npx prisma db push
node scripts/prepare-prisma.mjs --restore
```

`npm run db:seed` creates one empty workspace and an example project, and does nothing if a workspace already exists.

Sign-up also creates a user row. Set `OWNER_EMAIL` to your email if you need that first login to adopt workspaces that have no owner.

## 4. Run it locally

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- With `AUTH_DEV_BYPASS=1`, use **Continue locally** on the login page.
- With Supabase filled in and `AUTH_DEV_BYPASS=0`, use **Sign up**, then open the confirm email.

Set `AI_PROVIDER=groq` and `GROQ_API_KEY` before you try the agent. Other providers are listed in `web/.env.example`.

## 5. TikTok

1. Create an app at [developers.tiktok.com](https://developers.tiktok.com/).
2. Add the **Login Kit** and **Content Posting API** products.
3. Set the redirect URI to exactly:

   `https://your-domain.example/api/tiktok/oauth/callback`

   For local testing also add:

   `http://localhost:3000/api/tiktok/oauth/callback`

   No trailing slash. Put the same URL in `TIKTOK_REDIRECT_URI`.
4. Copy the client key and client secret into `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
5. In the TikTok URL properties, verify the host of `APP_BASE_URL`. TikTok pulls photos from `https://your-domain.example/api/media/pull/...`. A `*.supabase.co` host cannot be verified by DNS, which is why the app proxies media through your domain.
6. Until TikTok approves the app, publishing only works for users you list as sandbox testers.

`APIFY_TOKEN` is what refreshes profile stats when the app is running on Netlify. Locally, the app can scrape without Apify. Leave the token blank until sync fails in production.

## 6. Stripe

Skip this until you want paid plans. The app still runs on the free tier.

1. Create four recurring monthly products in Stripe (Creator, Team, Pro, Agency). The prices in the product today are $24, $34, $44, and $89. You can charge something else; the labels in the app are fixed, the Stripe price is whatever you create.
2. Copy each product id (`prod_...`) into both:
   - `STRIPE_PRODUCT_CREATOR`, `STRIPE_PRODUCT_TEAM`, `STRIPE_PRODUCT_PRO`, `STRIPE_PRODUCT_AGENCY`
   - the matching `NEXT_PUBLIC_STRIPE_PRODUCT_*` variables (same four ids)
3. Optional: set `STRIPE_PRICE_*` to a specific price id if you do not want the app to pick the active monthly price itself.
4. Copy the secret key and the publishable key.
5. Open **Settings → Billing → Customer portal**, turn the portal on, and copy the login link into `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL`.
6. Add a webhook endpoint pointing at `https://your-domain.example/api/webhooks/stripe`. Subscribe it to customer and subscription events. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

On your laptop:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Put the `whsec_...` value that command prints into `STRIPE_WEBHOOK_SECRET`.

## 7. Deploy

Netlify is the host this repository is set up for. `netlify.toml` builds the `web` folder with Node 22 and the Next.js plugin.

1. Push your own copy of this repository to GitHub (see the note at the bottom if you were given a `public-export` branch).
2. In Netlify: **Add new site → Import an existing project**. The base directory, build command, and publish directory come from `netlify.toml`.
3. In **Site configuration → Environment variables**, add every variable from `web/.env` that you filled in. In particular:
   - `APP_BASE_URL` and `NEXT_PUBLIC_APP_BASE_URL` = `https://your-domain.example` (no trailing slash)
   - `DATABASE_URL` = the Supabase pooler URI
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `AUTH_DEV_BYPASS` = `0`
   - `GROQ_API_KEY` and any other keys you use
4. Attach your domain. Supabase Site URL and the TikTok redirect URI must use that same origin.
5. Deploy. `NEXT_PUBLIC_*` values are baked in at build time. After you change one, redeploy.
6. Open `https://your-domain.example/api/health`. You want `"ok": true`. `"missingRequired"` lists anything the server still needs. The health page reports whether a variable is set. It does not show the value.

Any other Node host works if it runs `npm run build` and `npm run start` inside `web/` with the same variables. Set `APP_BASE_URL` to the public origin.

## 8. Optional Python slideshow helper

This is separate from the website. From the repository root:

```bash
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Fill `OPENAI_API_KEY` in the root `.env` (not `web/.env`). Edit `config.yaml` with your app name and TikTok handle. Then:

```bash
python main.py setup
python main.py run-all --dry-run
```

`GEMINI_API_KEY` is only for `python free_preview.py --gemini`. `SOCIALCLAW_API_KEY` is only for scheduling through SocialClaw.

## Troubleshooting

**The page says Supabase is not configured**

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are both empty, or you changed them without restarting `npm run dev`. On Netlify, redeploy after changing any `NEXT_PUBLIC_` variable.

**Login email opens and then fails**

The confirm link must contain `/auth/confirm?token_hash=`. Paste the template in `web/supabase/email-templates/`. Add that exact path to Supabase redirect URLs. Site URL must match `APP_BASE_URL`.

**`/api/health` shows the database disconnected**

`DATABASE_URL` is missing, still points at SQLite on the host, or uses the direct Supabase host on port 5432. Use the transaction pooler on port 6543. Run the `prisma db push` steps in section 3 against that same URI once, from your laptop.

**Build fails on `prisma generate` or the wrong database**

The build runs `node scripts/prepare-prisma.mjs`, which sets the Prisma provider from `DATABASE_URL`. A `postgresql://` URL selects Postgres. A `file:` URL selects SQLite. If a failed build leaves `schema.prisma` saying `postgresql` on your laptop, run `node scripts/prepare-prisma.mjs --restore`.

**TikTok redirects to the wrong place, or says the URI does not match**

`TIKTOK_REDIRECT_URI`, `APP_BASE_URL`, and the value in the TikTok portal must be identical, including `https` and with no trailing slash.

**Photos fail to publish**

`APP_BASE_URL` must be a public `https` origin TikTok can fetch. `SUPABASE_SERVICE_ROLE_KEY` must be set, and the storage bucket must exist.

**Checkout says the product id is missing**

Set `STRIPE_PRODUCT_CREATOR` (and Team, Pro, Agency) to product ids from **your** Stripe account. The old example file used someone else’s ids. Those are gone on purpose.

**“Manage billing” does nothing**

Set `NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL`, then redeploy. Or subscribe once so Stripe has a customer id and the app can open a portal session with `STRIPE_SECRET_KEY`.

**Contact, privacy, or terms show “the address in NEXT_PUBLIC_CONTACT_EMAIL”**

Set `NEXT_PUBLIC_CONTACT_EMAIL` and redeploy.

**Agent or chat returns an error about the provider**

`GROQ_API_KEY` is empty, or `AI_PROVIDER` names a provider whose key is empty. Groq retires models. If logs mention a retired model, set `GROQ_MODEL=qwen/qwen3.6-27b`.

**Outreach cannot send**

Set `RESEND_API_KEY`. Until you verify a domain, Resend only delivers from `onboarding@resend.dev`, and only to the email on your Resend account. Then set `OUTREACH_FROM_EMAIL` to an address on your domain.

**Do not commit secrets**

`.env`, `.env.local`, and `web/prisma/*.db` are git-ignored. If a key is ever pasted into a commit, rotate it in the provider’s dashboard. Do not make a repository public if its history has contained real keys.
