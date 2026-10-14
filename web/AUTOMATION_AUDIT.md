# Growth OS Publishing Automation Audit
**Date:** August 4, 2026  
**Status:** Post TikTok Production Approval  
**Goal:** Transition from manual prototype to fully automated production platform

---

## Executive Summary

Growth OS currently has **70% of the scheduling infrastructure** but **0% automation**. The UI, database schema, and manual publish flow work perfectly. What's missing is the **worker loop** that picks up scheduled posts and publishes them automatically.

This is a **scheduler-less scheduling system** — like a car with no engine.

---

## What Already Works ✅

### 1. OAuth & Account Management
- ✅ **Multi-account OAuth** - Unlimited TikTok accounts can connect
- ✅ **Token refresh** - `getValidAccessToken()` with `forceRefresh` automatically refreshes expired tokens
- ✅ **Scope detection** - `accountCanPublish()` and `accountCanUploadInbox()` check permissions
- ✅ **Account sync** - Background job refreshes profile data every 6 hours

### 2. Publishing Infrastructure  
- ✅ **Direct Post** - `publishPhotoCarousel()` with `DIRECT_POST` works perfectly
- ✅ **Draft upload** - `publishPhotoCarousel()` with `MEDIA_UPLOAD` sends to TikTok Inbox
- ✅ **Image hosting** - Supabase Storage or local `/api/media/pull/` serves HTTPS URLs verified in TikTok portal
- ✅ **Publish tracking** - `PublishJob` model records every publish attempt with status, metadata, errors

### 3. Queue & Scheduling UI
- ✅ **Schedule modal** - Users can pick day/time and schedule posts
- ✅ **Queue page** - Calendar view shows scheduled posts by day/time
- ✅ **Post.scheduledAt** - Database field stores when to publish
- ✅ **QueueItem** - Separate table links posts to weekly recurring slots
- ✅ **Post.status = "scheduled"** - Posts transition from `draft` → `scheduled`

### 4. Logging & History
- ✅ **PublishJob records** - Every API call creates a job with title, caption, privacy, images, status, error
- ✅ **DevLog** - Structured logging via `logger.info()` / `logger.error()`
- ✅ **JobRun** - Background job execution history (but no publish job exists)

### 5. Background Job System
- ✅ **runJob() framework** - Dispatcher for job types (`sync_accounts`, `analyse_performance`, etc.)
- ✅ **startBackgroundScheduler()** - Runs periodic jobs every 6–24 hours via `setInterval`
- ✅ **Job persistence** - `JobRun` table tracks start/finish/status/error

---

## What's Missing ❌

### **Critical — No Automation**
1. ❌ **No publish worker** - Nothing checks `Post.scheduledAt` and calls `publishPhotoCarousel()`
2. ❌ **No job type `publish_scheduled`** - `runJob()` doesn't recognize it
3. ❌ **No cron/scheduler trigger** - `startBackgroundScheduler()` doesn't run publish checks

### **Important — Production Safety**
4. ❌ **No rate limiting** - Can spam TikTok API (6 calls/min per user, daily post caps)
5. ❌ **No retry logic** - Failed publishes stay failed forever
6. ❌ **No concurrent publish prevention** - Two workers could publish the same post
7. ❌ **No staggered multi-account publishing** - Would fire all 10 accounts simultaneously
8. ❌ **No exponential backoff** - Retry storms on temporary failures

### **User Experience — Visibility**
9. ❌ **No publish history dashboard** - Can't see past publishes, only raw `PublishJob` table in Prisma Studio
10. ❌ **No "currently publishing" indicator** - Dashboard shows `posts: []` and `queue: []` but not active jobs
11. ❌ **No failed publish alerts** - Errors are logged but not surfaced to users
12. ❌ **No success rate tracking** - No aggregated "90% success rate this week"
13. ❌ **No next-scheduled display** - Dashboard doesn't say "Next post: Monday 10:00 @account"

### **Advanced Features — Not Yet Designed**
14. ❌ **No recurring schedules** - `QueueItem` has day/time but nothing re-schedules weekly posts
15. ❌ **No random time windows** - Can't say "publish between 10:00–11:30" (more natural)
16. ❌ **No best-time scheduling** - Can't auto-pick best posting hour from analytics
17. ❌ **No automation rules** - No UI for "Auto-publish 3/day Mon–Fri if score > 80"
18. ❌ **No campaigns** - No "Run 30 days, 3 posts/day, rotate packs" workflow
19. ❌ **No duplicate detection** - Can't prevent "similar post published <14 days ago"
20. ❌ **No daily limits per account** - Can't enforce "max 5 posts/day per account"

---

## Database Schema Assessment

### Strong Foundation ✅
```prisma
model Post {
  scheduledAt DateTime?  // ✅ When to publish
  status      String      // ✅ "draft" | "scheduled" | "published" | "failed"
  accountId   String?     // ✅ Which TikTok account
}

model QueueItem {
  postId    String?   // ✅ Links to Post
  day       String    // ✅ "Monday"
  time      String    // ✅ "10:00"
  status    String    // ✅ "scheduled" | "draft"
}

model PublishJob {
  accountId     String        // ✅ Track per-account
  status        String        // ✅ "publishing" | "submitted" | "failed"
  publishId     String        // ✅ TikTok's p_pub_url~ ID
  error         String?       // ✅ Error message
  imageUrlsJson String        // ✅ What was published
  metaJson      String        // ✅ Full diagnostics
  createdAt     DateTime      // ✅ When attempted
}
```

### Missing Tables ❌
```prisma
// ❌ Need: PublishAttempt (retry tracking)
// ❌ Need: AutomationRule (rule engine)
// ❌ Need: Campaign (multi-account campaigns)
// ❌ Need: PublishLock (prevent concurrent publishes)
```

---

## Architecture Gaps

### Current Flow (Manual Only)
```
User clicks "Post now"
    ↓
TikTokPublishModal
    ↓
POST /api/tiktok/publish
    ↓
publishPhotoCarousel()
    ↓
TikTok API
    ↓
PublishJob created
    ↓
DONE ✅
```

### Missing Flow (Scheduled)
```
⚠️ NONE — Nothing triggers scheduled posts
```

### What Should Exist
```
Scheduler Worker (every 1 min)
    ↓
Check Post WHERE status='scheduled' AND scheduledAt <= NOW()
    ↓
Acquire lock (prevent duplicate)
    ↓
Call publishPhotoCarousel()
    ↓
On success: status = 'published'
    ↓
On failure: Retry with backoff (3 attempts)
    ↓
Release lock
```

---

## TikTok API Limits (from earlier research)

Per **user access token**:
- ~6 Content Posting API calls per minute
- `spam_risk_too_many_posts` daily cap (exact number undocumented, ~10–20 posts/day for new apps)
- `spam_risk_too_many_pending_share` cap (max ~5 pending drafts per 24h)

Per **client (app)**:
- `reached_active_user_cap` limits daily active publishing users (grows with approval tier)

**Critical:** Multi-account batch publishes must be **staggered** (e.g. 2–5 min apart) to stay under rate limits.

---

## Comparison: What You Tested vs. What's Built

| Feature | You Saw Locally | Actually Exists |
|---------|----------------|-----------------|
| Schedule a post | ✅ Modal works | ✅ Sets `scheduledAt` |
| Post appears in Queue | ✅ Shows in calendar | ✅ `QueueItem` created |
| Auto-publish at scheduled time | ❌ Didn't happen | ❌ No worker loop |
| Manual "Post now" | ✅ Works | ✅ Full implementation |

**Why it seemed to work locally:** The schedule UI and queue display are polished. But **nothing monitors `scheduledAt`** to trigger publishes. It's a queue that never drains.

---

## Priority Assessment

### P0 — Must Have (Automated Publishing)
1. Publish worker job (`publish_scheduled`)
2. Scheduler trigger (check every 1–5 min)
3. Lock mechanism (prevent duplicate publishes)
4. Basic retry (3 attempts with backoff)
5. Status transitions (`scheduled` → `publishing` → `published` / `failed`)

### P1 — Production Safety
6. Rate limiting per account
7. Staggered multi-account publishing
8. Token refresh on 401 errors
9. Daily post cap enforcement

### P2 — User Visibility
10. Publish history dashboard
11. "Currently publishing" indicator
12. Failed publish alerts
13. Success rate widget

### P3 — Advanced Automation
14. Automation Rules page
15. Campaigns
16. Random time windows
17. Best-time scheduling
18. Duplicate detection

---

## Recommendations

### Phase 1: Core Automation (P0)
**Goal:** Scheduled posts publish automatically  
**Effort:** ~4–6 hours  
**Files:**
- Add `jobPublishScheduled()` to `web/src/services/jobs.ts`
- Wire into `runJob()` dispatcher
- Add to `startBackgroundScheduler()` (every 2 min)
- Add `publishScheduledPost()` helper with lock check
- Update `Post.status` after publish

### Phase 2: Production Hardening (P1)
**Goal:** Handle rate limits, retries, multi-account safely  
**Effort:** ~4–6 hours  
**Features:**
- Rate limiter (per-account publish timestamps)
- Staggered queue (sort accounts by last publish time)
- Exponential backoff retry
- Daily cap tracking

### Phase 3: Dashboard & Alerts (P2)
**Goal:** Users see what's happening  
**Effort:** ~3–4 hours  
**UI:**
- Publish History page (table of `PublishJob` with filters)
- Dashboard widget: "Publishing now: @account → post X"
- Dashboard widget: "Next scheduled: Monday 10:00 @account"
- Toast notifications for failed publishes

### Phase 4: Automation Rules (P3)
**Goal:** "Set and forget" campaigns  
**Effort:** ~12–16 hours (full feature)  
**New models:**
- `AutomationRule` (account, cadence, filters, active)
- `Campaign` (name, accounts, duration, packs, rules)
**New pages:**
- `/automation` — rule builder
- `/campaigns` — campaign manager

---

## Next Steps

### Option A: Minimal Viable Automation (P0 only)
**Delivers:** Scheduled posts publish automatically (no retry, no safety, single account)  
**Time:** 4–6 hours  
**Use case:** Proof of concept, manual multi-account staggering

### Option B: Production-Ready Publishing (P0 + P1)
**Delivers:** Safe multi-account automation with retry and rate limits  
**Time:** 8–12 hours  
**Use case:** Run 5–10 accounts hands-off for 30 days

### Option C: Full Operating System (P0 + P1 + P2 + P3)
**Delivers:** Campaign builder, automation rules, analytics-driven scheduling  
**Time:** 24–32 hours  
**Use case:** "Growth OS" as product — creators onboard and leave it running

---

## Architecture Recommendation

### Current (Manual Only)
```
Generator → Draft → User clicks "Post now" → TikTok
```

### Proposed (Automated)
```
Generator
    ↓
Draft saved with scheduledAt
    ↓
Scheduler Worker (cron: every 2 min)
    ↓
Check scheduled posts due now
    ↓
Publish Worker (single-threaded, staggered)
    ↓
publishPhotoCarousel()
    ↓
TikTok API
    ↓
Update Post.status + PublishJob
    ↓
Dashboard shows result
```

### Key Design Decisions

1. **Single-threaded worker** - One publish at a time per scheduler run (prevents rate limit storms)
2. **Staggered multi-account** - Sort by `lastPublishAt`, publish oldest first, wait 3–5 min between accounts
3. **Optimistic locking** - Use `Post.status = "publishing"` as lock (SELECT FOR UPDATE on Postgres)
4. **Retry as separate job** - Failed posts re-queue with `scheduledAt = NOW() + backoff`, max 3 attempts
5. **No external queue** - Postgres `Post` table is the queue (simpler, fewer dependencies)

---

## Code Locations

### Existing Infrastructure
- **Publish logic:** `web/src/services/tiktok-publish.ts` → `publishPhotoCarousel()`
- **Job framework:** `web/src/services/jobs.ts` → `runJob()`, `startBackgroundScheduler()`
- **OAuth:** `web/src/services/tiktok-oauth.ts` → `getValidAccessToken()`
- **DB models:** `web/prisma/schema.prisma` → `Post`, `QueueItem`, `PublishJob`

### Files to Create
- **Publish worker:** `web/src/services/publish-worker.ts` → New
- **Rate limiter:** `web/src/lib/rate-limiter.ts` → New
- **Publish history API:** `web/src/app/api/publish-jobs/route.ts` → New
- **Publish history page:** `web/src/app/(app)/publishes/page.tsx` → New
- **Automation rules (Phase 4):** `web/src/app/(app)/automation/page.tsx` → New

---

## Summary

**Growth OS is 70% built.** The foundation is excellent:

✅ Multi-account OAuth  
✅ Token refresh  
✅ Manual publishing works  
✅ Queue UI exists  
✅ Scheduling UI works  
✅ Database schema ready  

**The missing 30% is pure automation logic:**

❌ Worker loop that monitors `scheduledAt`  
❌ Retry + rate limiting  
❌ Dashboard visibility  

**No duplicate systems exist.** There's one `Post` table, one `publishPhotoCarousel()` function, one job framework. We just need to wire the scheduler trigger.

**Estimated effort to production:**
- P0 (core automation): **4–6 hours**
- P0 + P1 (production-safe): **8–12 hours**
- Full vision (P0–P3): **24–32 hours**

**Recommendation:** Start with **Phase 1 (P0)** to prove the loop works, then immediately add **Phase 2 (P1)** for safety before running on real accounts at scale.
