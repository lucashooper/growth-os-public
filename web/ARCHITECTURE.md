# Growth OS Architecture & Usage Guide

## System Overview

Growth OS is a full-stack Next.js application for TikTok content management and generation. Here's how everything works:

```
User → Next.js Frontend → API Routes → Services → External APIs
                    ↓
              Prisma ORM
                    ↓
              SQLite Database
```

---

## Image Handling Architecture

### Where Images Come From

1. **TikTok CDN** (Public Posts)
   - When syncing published TikTok posts
   - URLs look like: `https://p16-sign-sg.tiktokcdn.com/...`
   - **Problem**: These URLs expire after hours/days
   - **Current**: Direct link (no proxy)

2. **Supabase Storage** (Generated Content)
   - User-uploaded images
   - Generated slide backgrounds
   - Saved in: the Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET` (default `uploads`)
   - **Problem**: Sometimes missing due to upload failures

3. **Placeholder Generation** (Fallback)
   - Gradient SVG images generated client-side
   - Base64-encoded data URLs
   - Always works, never fails

### Image Flow Diagram

```
┌─────────────────┐
│  Post Created   │
└────────┬────────┘
         │
         ▼
   ┌─────────┐
   │ Has URL?│──NO──┐
   └────┬────┘      │
        │YES        │
        ▼           ▼
  ┌──────────┐  ┌────────────┐
  │  TikTok  │  │ Supabase   │
  │    CDN   │  │  Storage   │
  └────┬─────┘  └──────┬─────┘
       │               │
       │    ┌──────────┘
       │    │
       ▼    ▼
  ┌────────────┐
  │ Browser    │
  │ Loads      │
  └────┬───────┘
       │
    SUCCESS?
       │
    ┌──┴──┐
    │NO   │YES
    ▼     ▼
┌────────┐ Display
│Gradient│
│Fallback│
└────────┘
```

### Current Issues

**TikTok CDN URLs Expire:**
```javascript
// Example TikTok URL with expiration
https://p16-sign-sg.tiktokcdn.com/obj/...?x-expires=1724443200
                                           ↑ Expires after ~24 hours
```

**Solution Needed**: Image Proxy
```
User Request
    ↓
/api/image-proxy?url=https://tiktocdn.com/...
    ↓
Check ImageCache table
    ↓
If expired → Download → Save to Supabase → Update cache
    ↓
Return permanent Supabase URL
```

---

## Web Scraping with Playwright

### What We Use Playwright For

**1. TikTok Profile Scraping** (`src/services/tiktok-sync.ts`)
```typescript
// When syncing a TikTok account
async function syncAccount(accountId: string) {
  // 1. Launch headless browser
  const browser = await playwright.chromium.launch();
  
  // 2. Navigate to TikTok profile
  await page.goto(`https://www.tiktok.com/@${username}`);
  
  // 3. Extract profile data
  const profile = await parseProfileFromBlobs(html);
  // Gets: avatar, bio, followers, following, hearts
  
  // 4. Extract recent videos
  const videos = await parseVideosFromBlobs(html);
  // Gets: video URLs, views, likes, captions, thumbnails
  
  // 5. Save to database
  await prisma.connectedAccount.update({ ... });
}
```

**Why Playwright?**
- TikTok doesn't have a public API for profile data
- Content is JavaScript-rendered (can't use simple HTTP)
- Need to bypass rate limiting (looks like a real browser)

**Fallback**: If Playwright fails, we try regex parsing on the HTML

### When Playwright Runs

**Automatic Triggers:**
1. When user clicks "Sync" on Accounts page
2. Background job runs every 6 hours
3. After OAuth connection (queued sync)

**Manual Trigger:**
- Click "Sync Now" button on account card

---

## Data Flow: Creating Content

### 1. Generate with AI

```
User enters prompt
    ↓
POST /api/ai/generate
    ↓
lib/ai/index.ts → completeWithAI()
    ↓
Groq API (Qwen model)
    ↓
Returns: { hook, slides[], caption, visualSlides[] }
    ↓
Save to Post table (status: "draft")
    ↓
Save images to LibraryAsset table
```

### 2. Publish to TikTok

```
User clicks "Publish"
    ↓
TikTokPublishModal opens
    ↓
User configures: privacy, comments, music, etc.
    ↓
POST /api/tiktok/publish
    ↓
services/tiktok-publish.ts
    ↓
TikTok Content Posting API
    ↓
Two modes:
  1. DIRECT_POST → Publishes immediately
  2. MEDIA_UPLOAD → Saves to TikTok draft inbox
```

### 3. Schedule Publishing

```
User clicks "Schedule"
    ↓
ScheduleModal → Pick date/time
    ↓
POST /api/publish-attempts
    ↓
Creates PublishAttempt record
    ↓
Background worker (runs every 2 min)
    ↓
Checks for due attempts
    ↓
Executes publish
    ↓
Updates attempt status
```

---

## Database Schema (Simplified)

### Core Tables

**Project** - Workspace isolation
```
id, name, description, color, userId
```

**ConnectedAccount** - TikTok OAuth accounts
```
id, projectId, platform, username, avatar,
accessToken, refreshToken, tokenExpiresAt
```

**Post** - Content (drafts + published)
```
id, projectId, accountId, hook, caption,
coverUrl, slidesJson, metaJson, status,
views, likes, comments, publishedAt
```

**PublishAttempt** - Scheduled publishes
```
id, postId, accountId, scheduledAt, status,
attemptCount, lastError, publishedAt
```

**LibraryAsset** - Media files
```
id, projectId, postId, url, kind, folder, tags
```

---

## API Endpoints

### Posts

**GET /api/posts**
```bash
# Get all posts for project
?projectId=cm3...&status=published

# Get specific posts
?ids=cm3abc,cm3def
```

**POST /api/posts**
```json
{
  "projectId": "cm3...",
  "hook": "Why I quit...",
  "caption": "Full story...",
  "slides": ["url1", "url2", ...],
  "status": "draft",
  "coverUrl": "https://..."
}
```

### Publishing

**POST /api/tiktok/publish**
```json
{
  "accountIds": ["cm3..."],
  "images": ["base64...", ...],
  "caption": "Text...",
  "privacy": "PUBLIC_TO_EVERYONE",
  "postMode": "DIRECT_POST"
}
```

**POST /api/publish-attempts**
```json
{
  "postId": "cm3...",
  "accountIds": ["cm3..."],
  "scheduledAt": "2026-08-24T10:00:00Z"
}
```

### Sync

**POST /api/sync**
```json
{
  "accountId": "cm3..."
}
```
Triggers Playwright scraping of TikTok profile.

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL="file:./dev.db"

# TikTok OAuth
TIKTOK_CLIENT_KEY=""
TIKTOK_CLIENT_SECRET=""
APP_BASE_URL="https://your-domain.example"

# AI Provider (pick one)
GROQ_API_KEY=""
GROQ_MODEL="qwen/qwen3.6-27b"

# Storage — the app reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
```

### Optional

```bash
# Image optimization
NEXT_PUBLIC_SUPABASE_URL="..."

# Logging
LOG_PERSIST="1"

# Playwright (auto-installs if missing)
PLAYWRIGHT_BROWSERS_PATH=0
```

---

## Background Jobs

**Location**: `src/services/jobs.ts`

**Job Types:**

1. **publish_scheduled** (every 2 minutes)
   - Finds due PublishAttempt records
   - Executes TikTok API calls
   - Updates attempt status
   - Retries on failure (exponential backoff)

2. **sync_accounts** (every 6 hours)
   - Loops through active accounts
   - Triggers Playwright scraping
   - Updates followers, views, likes

3. **cleanup_old_logs** (daily)
   - Deletes DevLog entries older than 30 days

**Starting Jobs:**
```bash
# In src/services/jobs.ts
export function startJobs() {
  setInterval(() => runPublishScheduled(), 120_000); // 2 min
  setInterval(() => runSyncAccounts(), 21_600_000); // 6 hours
}
```

---

## Performance Optimizations

### 1. Hover Prefetching

When user hovers sidebar link for 300ms:
```typescript
// src/components/sidebar.tsx
onMouseEnter={() => {
  setTimeout(() => {
    apiFetch(`/api/insights/${projectId}`);
  }, 300);
}}
```

### 2. API Response Caching

```typescript
// src/lib/api-client.ts
const cache = new Map();

export async function apiFetch(url) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < 120_000) {
    return cached.data;
  }
  
  const fresh = await fetch(url);
  cache.set(url, { data: fresh, ts: Date.now() });
  return fresh;
}
```

### 3. Image Lazy Loading

All images use `loading="lazy"` (browser native).

---

## Common Issues & Solutions

### Issue: Images Not Loading

**Symptom**: Gradient placeholders everywhere

**Cause**: TikTok CDN URLs expired

**Temporary Fix**: Re-sync the account
```
Accounts page → Click account → Sync Now
```

**Permanent Fix**: Implement image proxy (pending)

### Issue: "Profile parse failed"

**Symptom**: Avatar missing, followers = 0

**Cause**: Playwright scraping failed or TikTok changed HTML structure

**Fix**: 
1. Try manual sync
2. Check `src/services/tiktok-parse.ts` regex patterns
3. Update selectors if TikTok UI changed

### Issue: OAuth Token Expired

**Symptom**: "Access token expired" error

**Fix**: Reconnect account
```
Accounts page → Disconnect → Connect again
```

### Issue: Groq Model 404

**Symptom**: AI generation fails with model not found

**Fix**: Update model in `.env`
```bash
GROQ_MODEL="qwen/qwen3.6-27b"  # or openai/gpt-oss-120b
```

---

## Deployment

### Build for Production

```bash
cd web
npm run build
```

### Deploy to Netlify

```bash
# netlify.toml already configured
git push  # Auto-deploys to Netlify
```

### Environment Variables in Production

Set in Netlify dashboard:
- `DATABASE_URL` (production database)
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `APP_BASE_URL`
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

---

## File Structure

```
web/
├── src/
│   ├── app/
│   │   ├── (app)/           # Protected routes
│   │   │   ├── dashboard/
│   │   │   ├── generate/
│   │   │   ├── analytics/
│   │   │   └── accounts/
│   │   ├── api/             # API routes
│   │   │   ├── posts/
│   │   │   ├── tiktok/
│   │   │   └── ai/
│   │   └── login/           # Auth page
│   ├── components/          # React components
│   ├── lib/                 # Utilities
│   │   ├── ai/             # AI provider setup
│   │   ├── supabase/       # Storage client
│   │   └── api-client.ts   # Fetch wrapper
│   └── services/            # Business logic
│       ├── tiktok-sync.ts  # Playwright scraping
│       ├── tiktok-publish.ts
│       ├── analytics.ts
│       └── jobs.ts          # Background workers
├── prisma/
│   └── schema.prisma        # Database schema
└── public/                  # Static assets
```

---

## Testing Locally

### 1. Start Dev Server
```bash
cd web
npm run dev
```

### 2. Open Browser
```
http://localhost:3000
```

### 3. Test Features

**Image Loading:**
- Go to Dashboard
- Open DevTools Console
- Look for `[PostCard] Image failed to load:` logs
- Check which URLs are failing

**AI Generation:**
- Go to Generator
- Enter a prompt
- Check console for Groq API calls

**TikTok Sync:**
- Go to Accounts
- Click "Sync Now"
- Check terminal for Playwright logs

---

## Monitoring & Logs

### Client-Side Logs

**Console patterns to watch:**
```javascript
[PostCard] Image failed to load: { ... }
[sidebar] Prefetching: /analytics
[placeholder-image] Generating placeholder
[posts API] Creating post with cover
```

### Server-Side Logs

**Terminal patterns:**
```
[INFO] [sync] Sync succeeded for account cm3...
[ERROR] [api] TikTok token refresh failed
[INFO] [publish-worker] Publish attempt cm3... succeeded
```

### Database Logs

```sql
-- View recent errors
SELECT * FROM DevLog 
WHERE level = 'error' 
ORDER BY createdAt DESC 
LIMIT 10;
```

---

## Future Improvements

### Planned

1. **Image Proxy** - Cache all external images
2. **WebSocket** - Real-time updates
3. **Bulk Operations** - Multi-select posts
4. **Analytics Dashboard** - Real-time charts
5. **AI Action Centre** - Daily recommendations

### Under Consideration

1. **Multiple AI Providers** - Fallback chain
2. **Video Support** - Not just slideshows
3. **Team Collaboration** - Multi-user workspaces
4. **Advanced Scheduling** - Recurring posts

---

## Getting Help

**Debug Mode:**
```bash
# In .env
NODE_ENV=development
LOG_PERSIST=1
```

**Check Logs:**
1. Browser DevTools Console (F12)
2. Terminal running `npm run dev`
3. Database: `SELECT * FROM DevLog`

**Common Commands:**
```bash
# Reset database
npx prisma db push --force-reset

# View schema
npx prisma studio

# Generate types
npx prisma generate
```

---

**This architecture prioritizes simplicity and reliability over complexity.**
