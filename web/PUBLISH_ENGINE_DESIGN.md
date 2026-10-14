# Growth OS Publish Engine — Production Architecture

**Date:** August 4, 2026  
**Status:** Production Design (P0 + P1 + Extensibility)

---

## Design Principles

1. **Publish Jobs are first-class entities** — not just Post.status transitions
2. **Single source of truth** — One engine, extensible for all future automation
3. **Observable by default** — Every state change is logged and exposed
4. **Failure is expected** — Retries, backoff, and health monitoring built-in
5. **Rate limits are constraints** — Per-account queues prevent API abuse
6. **Extensibility over features** — Hook points for Campaigns, Rules, AI scheduling

---

## Core Concepts

### 1. Publish Job Lifecycle

```
QUEUED → PENDING → PUBLISHING → SUBMITTED → COMPLETED
   ↓         ↓          ↓            ↓
 FAILED   FAILED    FAILED      FAILED
   ↓
 RETRY (max 3 attempts)
   ↓
 ABANDONED
```

**States:**
- `QUEUED` — Scheduled, waiting for publish window
- `PENDING` — Due now, waiting for worker pickup
- `PUBLISHING` — Worker acquired lock, calling TikTok API
- `SUBMITTED` — TikTok accepted, awaiting status confirmation
- `COMPLETED` — TikTok confirmed success
- `FAILED` — Attempt failed, will retry if attempts < maxRetries
- `ABANDONED` — Max retries exhausted, human intervention needed

### 2. Publish Windows (Randomness)

Users schedule with a **window** instead of exact time:

```typescript
scheduledAt: 2026-08-05 10:00:00      // Window start
publishWindow: 90                      // Minutes (10:00–11:30)
actualPublishAt: null                  // Computed when job starts
```

**Benefits:**
- More natural posting patterns (not 10:00:00 sharp)
- Avoids thundering herd (10 accounts at exact same second)
- Better rate limit distribution

### 3. Per-Account Rate Limiting

Track publish timestamps per account:

```typescript
RateLimit {
  accountId: string
  lastPublishAt: Date
  publishCount24h: number
  publishCountHour: number
}
```

**Constraints:**
- Min 10 minutes between publishes (same account)
- Max 10 posts per day per account (configurable)
- Max 3 posts per hour per account
- TikTok API: ~6 calls/min per token (enforced via backoff)

### 4. Staggered Multi-Account Publishing

When multiple accounts have jobs due:

1. Sort by `account.lastPublishAt` (oldest first)
2. Publish one at a time with **3–5 min gaps**
3. Check rate limits before each publish
4. Skip account if rate-limited, move to next
5. Re-queue skipped jobs with +2 min delay

**Example stagger:**
```
10:00 — @account_a published
10:03 — @account_b published
10:08 — @account_c skipped (rate limited), re-queue for 10:10
10:11 — @account_d published
```

### 5. Locking & Concurrency

Prevent duplicate publishes via optimistic locking:

```sql
UPDATE PublishAttempt
SET status = 'PUBLISHING', lockedAt = NOW(), workerId = ?
WHERE id = ? AND status = 'PENDING' AND lockedAt IS NULL
RETURNING *
```

If `RETURNING` is empty → another worker already locked it.

**Worker ID:** Generated once per process (UUID), included in all logs.

---

## Database Schema

### New Tables

```prisma
model PublishAttempt {
  id              String    @id @default(cuid())
  postId          String
  post            Post      @relation(...)
  accountId       String
  account         ConnectedAccount @relation(...)
  
  // Scheduling
  scheduledAt     DateTime            // Window start
  publishWindow   Int      @default(0) // Minutes (0 = exact time)
  actualPublishAt DateTime?           // Computed random time within window
  
  // Lifecycle
  status          String    @default("QUEUED")  // QUEUED | PENDING | PUBLISHING | SUBMITTED | COMPLETED | FAILED | ABANDONED
  attempt         Int       @default(1)
  maxRetries      Int       @default(3)
  
  // Locking
  lockedAt        DateTime?
  lockedBy        String?   // Worker ID
  
  // Result
  publishJobId    String?   // Links to PublishJob (TikTok API record)
  publishId       String?   // TikTok's p_pub_url~
  error           String?
  errorCode       String?
  
  // Metadata
  priority        Int       @default(0)  // Higher = publish first
  source          String    @default("manual")  // manual | campaign | automation_rule | ai_schedule
  metaJson        String    @default("{}")
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([status, scheduledAt])
  @@index([accountId, status])
  @@index([postId])
}

model PublishHealth {
  id              String    @id @default(cuid())
  accountId       String
  account         ConnectedAccount @relation(...)
  
  // Recent activity
  lastPublishAt   DateTime?
  lastSuccessAt   DateTime?
  lastFailureAt   DateTime?
  
  // Rate limiting state
  publishCount24h Int       @default(0)
  publishCount1h  Int       @default(0)
  windowResetAt   DateTime  @default(now())
  
  // Health metrics
  successCount    Int       @default(0)
  failureCount    Int       @default(0)
  successRate     Float     @default(1.0)  // 0.0–1.0
  
  // Status
  isRateLimited   Boolean   @default(false)
  rateLimitUntil  DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([accountId])
}
```

### Extended Tables

```prisma
model Post {
  // ... existing fields
  
  publishAttempts PublishAttempt[]
  
  // Deprecate these (move to PublishAttempt)
  // scheduledAt     DateTime?
  // Keep for backward compat during migration
}

model ConnectedAccount {
  // ... existing fields
  
  publishAttempts PublishAttempt[]
  publishHealth   PublishHealth?
}
```

---

## Service Architecture

### 1. Publish Engine (`publish-engine.ts`)

**Core scheduler logic — no I/O, pure business logic**

```typescript
interface PublishEngineConfig {
  minPublishGapMinutes: number      // Default: 10
  maxPublishesPerDay: number        // Default: 10
  maxPublishesPerHour: number       // Default: 3
  staggerGapMinutes: [number, number] // Default: [3, 5]
  maxConcurrentPublishes: number    // Default: 1
}

class PublishEngine {
  // Core scheduling
  async getPublishableJobs(): Promise<PublishAttempt[]>
  async computeActualPublishTime(attempt: PublishAttempt): Promise<Date>
  async canPublishNow(accountId: string): Promise<{ ok: boolean; reason?: string }>
  
  // Locking
  async acquireLock(attemptId: string, workerId: string): Promise<boolean>
  async releaseLock(attemptId: string): Promise<void>
  
  // Lifecycle
  async transitionTo(attemptId: string, status: string, meta?: object): Promise<void>
  async scheduleRetry(attemptId: string, error: string): Promise<void>
  
  // Rate limiting
  async updatePublishHealth(accountId: string, success: boolean): Promise<void>
  async getRateLimitedAccounts(): Promise<string[]>
  
  // Staggering
  async getNextPublishableAccount(dueAttempts: PublishAttempt[]): Promise<string | null>
}
```

### 2. Publish Worker (`publish-worker.ts`)

**Job that runs every 2 min — orchestrates publishing**

```typescript
async function jobPublishScheduled(workerId: string): Promise<string> {
  const engine = new PublishEngine()
  const publisher = new Publisher()
  
  // 1. Find jobs due now (status=PENDING, actualPublishAt <= NOW)
  const dueJobs = await engine.getPublishableJobs()
  if (!dueJobs.length) return "No jobs due"
  
  // 2. Group by account, sort by lastPublishAt (stagger)
  const accountQueue = await engine.getNextPublishableAccount(dueJobs)
  if (!accountQueue) return "All accounts rate-limited"
  
  // 3. Publish one job at a time (single-threaded)
  let published = 0
  for (const job of dueJobs.filter(j => j.accountId === accountQueue)) {
    // Acquire lock
    const locked = await engine.acquireLock(job.id, workerId)
    if (!locked) continue  // Another worker got it
    
    try {
      // Check rate limits
      const { ok, reason } = await engine.canPublishNow(job.accountId)
      if (!ok) {
        await engine.scheduleRetry(job.id, reason)
        continue
      }
      
      // Publish
      await engine.transitionTo(job.id, "PUBLISHING")
      const result = await publisher.publish(job)
      
      if (result.success) {
        await engine.transitionTo(job.id, "SUBMITTED", { publishId: result.publishId })
        await engine.updatePublishHealth(job.accountId, true)
        published++
      } else {
        await engine.scheduleRetry(job.id, result.error)
        await engine.updatePublishHealth(job.accountId, false)
      }
    } finally {
      await engine.releaseLock(job.id)
    }
    
    // Stagger: wait 3–5 min before next publish
    if (published > 0) break
  }
  
  return `Published ${published} jobs`
}
```

### 3. Publisher (`publisher.ts`)

**Thin wrapper around publishPhotoCarousel — handles prep & errors**

```typescript
class Publisher {
  async publish(attempt: PublishAttempt): Promise<PublishResult> {
    const post = await prisma.post.findUnique({ where: { id: attempt.postId } })
    const account = await prisma.connectedAccount.findUnique({ where: { id: attempt.accountId } })
    
    // Render slides to images (if not pre-rendered)
    const photoUrls = await this.prepareImages(post)
    
    // Call TikTok API
    try {
      const result = await publishPhotoCarousel({
        projectId: post.projectId,
        accountId: attempt.accountId,
        postId: post.id,
        title: post.hook.slice(0, 90),
        description: post.caption || post.hook,
        privacyLevel: "SELF_ONLY",  // Configurable via AutomationRule later
        photoUrls,
        consentGiven: true,
        postMode: "DIRECT_POST",
        // ... other fields from post.meta
      })
      
      return { success: true, publishId: result.publishId, jobId: result.jobId }
    } catch (err) {
      return { success: false, error: this.formatError(err) }
    }
  }
}
```

---

## API Endpoints

### `/api/publish-attempts`

**GET** — List attempts (filterable by account, status, date)  
**POST** — Create new attempt (schedule a post)

```typescript
// POST /api/publish-attempts
{
  postId: string
  accountId: string
  scheduledAt: string        // ISO 8601
  publishWindow?: number     // Minutes (default: 0)
  priority?: number          // Default: 0
  source?: string            // Default: "manual"
}

// Response
{
  id: string
  status: "QUEUED"
  scheduledAt: string
  actualPublishAt: string    // Computed random time
}
```

### `/api/publish-attempts/[id]`

**GET** — Get attempt details  
**PATCH** — Update (cancel, retry, change time)  
**DELETE** — Cancel attempt

### `/api/publish-health`

**GET** — Get health metrics per account

```typescript
// GET /api/publish-health?accountId=xxx
{
  accountId: string
  lastPublishAt: string
  successRate: 0.95
  publishCount24h: 8
  isRateLimited: false
  nextAvailableAt: string
}
```

---

## Dashboard UI

### `/publishes` — Publish Dashboard

**Tabs:**
1. **Live** — Currently publishing + next 5 scheduled
2. **History** — Past 48 hours (success/fail)
3. **Health** — Per-account success rates, rate limits

**Live Tab:**
```
┌─────────────────────────────────────────────┐
│ Currently Publishing (2)                     │
├─────────────────────────────────────────────┤
│ @account_a  →  "10 Daily Habits..."         │
│ Status: Submitting to TikTok (30s ago)      │
│                                              │
│ @account_b  →  "Stoic Quote #42"            │
│ Status: Rendering images (12s ago)          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Next Scheduled (5)                           │
├─────────────────────────────────────────────┤
│ 10:23  @account_c  "Morning Motivation"     │
│ 10:47  @account_a  "Productivity Tip"       │
│ 11:02  @account_d  "Fitness Challenge"      │
│ ...                                          │
└─────────────────────────────────────────────┘
```

**History Tab:**
- Table: Time | Account | Post | Status | Duration | Retry #
- Filters: Account, Status, Date range
- Export CSV

**Health Tab:**
- Cards per account: Success rate, Last 24h activity, Rate limit status
- Chart: Publishes per hour (last 7 days)
- Alert: Accounts with <80% success rate

---

## Extensibility Hooks

### 1. Automation Rules (Future)

Plug into engine via `source: "automation_rule"`:

```typescript
interface AutomationRule {
  id: string
  accountId: string
  active: boolean
  
  // Scheduling
  daysOfWeek: string[]       // ["Monday", "Friday"]
  timeWindows: [string, string][]  // [["10:00", "12:00"], ["18:00", "20:00"]]
  postsPerDay: number
  
  // Filters
  minOpportunityScore?: number
  similarPostCooldown?: number  // Days
  
  // Content source
  imagePackIds?: string[]
  hookStrategy?: "rotate" | "best" | "random"
}

// Engine picks content + schedules PublishAttempt
await engine.createAttemptFromRule(rule, selectedPost)
```

### 2. Campaigns (Future)

Orchestrates multiple rules + tracks progress:

```typescript
interface Campaign {
  id: string
  name: string
  accountIds: string[]
  startDate: Date
  endDate: Date
  postsPerDay: number
  
  // Automation
  autoRegenerate: boolean
  rules: AutomationRule[]
}

// Engine tracks campaign progress
await engine.getCampaignStatus(campaignId)
// → { totalScheduled: 180, published: 42, remaining: 138, eta: "Aug 20" }
```

### 3. AI-Driven Scheduling (Future)

Analyzes best posting times per account:

```typescript
interface AIScheduleRecommendation {
  accountId: string
  bestHours: number[]        // [10, 15, 20] (hours of day)
  confidence: number
  reason: string
}

// Engine uses recommendations to set scheduledAt
await engine.scheduleWithAI(postId, accountId, recommendation)
```

### 4. Competitor-Driven Optimization (Future)

React to competitor activity:

```typescript
interface CompetitorTrigger {
  competitorId: string
  event: "new_post" | "viral_hook" | "trending_topic"
  action: "publish_counter" | "schedule_similar" | "boost_priority"
}

// Engine adjusts priorities or creates counter-posts
await engine.handleCompetitorEvent(trigger)
```

---

## Migration Strategy

### Phase 1: Schema & Core Engine (This PR)
- Add `PublishAttempt`, `PublishHealth` tables
- Implement `PublishEngine`, `publish-worker`, `Publisher`
- Wire into `startBackgroundScheduler()`
- Keep existing `Post.scheduledAt` for backward compat

### Phase 2: Dashboard & Monitoring
- Build `/publishes` page
- Add real-time status via polling or SSE
- Health alerts (toast notifications)

### Phase 3: Automation Rules
- Add `AutomationRule` model + CRUD
- Build `/automation` rule builder page
- Engine creates attempts from rules

### Phase 4: Campaigns
- Add `Campaign` model + CRUD
- Build `/campaigns` campaign manager
- Multi-account orchestration

---

## Configuration

### Environment Variables

```env
# Publish Engine
PUBLISH_WORKER_INTERVAL_MS=120000        # 2 min
PUBLISH_MIN_GAP_MINUTES=10               # Between posts (same account)
PUBLISH_MAX_PER_DAY=10                   # Per account
PUBLISH_MAX_PER_HOUR=3                   # Per account
PUBLISH_STAGGER_GAP_MIN=3                # Min gap between accounts
PUBLISH_STAGGER_GAP_MAX=5                # Max gap between accounts
PUBLISH_MAX_RETRIES=3
PUBLISH_RETRY_BACKOFF_BASE_MS=300000     # 5 min → 10 min → 20 min
```

### Per-Account Overrides (Future)

```typescript
ConnectedAccount {
  publishConfig?: {
    maxPerDay?: number
    minGapMinutes?: number
    preferredHours?: number[]
  }
}
```

---

## Observability

### Logging

Every state transition logs:

```typescript
logger.info("publish-engine", "attempt:transition", {
  attemptId,
  postId,
  accountId,
  fromStatus,
  toStatus,
  attempt: 2,
  workerId,
  duration: 42000,  // ms
})
```

### Metrics (Future)

Track via `DevLog` or external metrics:

- `publish.queued` — New attempts created
- `publish.success` — Completed publishes
- `publish.failed` — Failed attempts
- `publish.retry` — Retry attempts
- `publish.abandoned` — Max retries exhausted
- `publish.rate_limited` — Skipped due to rate limit
- `publish.duration` — Time from lock → complete

### Alerts (Future)

- Account success rate drops below 80%
- Account rate-limited for >1 hour
- >5 abandoned attempts in 24h
- Worker hasn't run in >10 min

---

## Testing Strategy

### Unit Tests
- `PublishEngine.getPublishableJobs()` — correct filtering
- `PublishEngine.computeActualPublishTime()` — random within window
- `PublishEngine.canPublishNow()` — rate limit checks
- `PublishEngine.scheduleRetry()` — exponential backoff

### Integration Tests
- Full publish flow (mock TikTok API)
- Multi-account staggering
- Rate limit enforcement
- Retry with backoff

### E2E Tests
- Schedule → Wait → Verify published on TikTok
- Cancel scheduled post
- Retry after failure
- Multi-account campaign simulation

---

## Success Criteria

**P0 (Core Automation):**
✅ Scheduled posts publish automatically  
✅ No manual "Post now" needed  
✅ Works with 1 account  

**P1 (Production Safety):**
✅ Multi-account staggering (3–5 min gaps)  
✅ Rate limiting prevents API abuse  
✅ Failed posts retry with backoff  
✅ Daily/hourly caps enforced  
✅ Dashboard shows live status  

**Future (Extensibility):**
✅ Automation Rules plug into engine  
✅ Campaigns orchestrate multiple accounts  
✅ AI scheduling uses same attempt system  
✅ No duplicate scheduling logic exists  

---

## Files to Create/Modify

### New Files (16)
```
web/src/services/publish-engine.ts       # Core scheduler
web/src/services/publish-worker.ts       # Worker job
web/src/services/publisher.ts            # TikTok API wrapper
web/src/lib/rate-limiter.ts              # Rate limit state
web/src/app/api/publish-attempts/route.ts
web/src/app/api/publish-attempts/[id]/route.ts
web/src/app/api/publish-health/route.ts
web/src/app/(app)/publishes/page.tsx    # Dashboard
web/src/components/publish-live-widget.tsx
web/src/components/publish-history-table.tsx
web/src/components/publish-health-card.tsx
web/prisma/migrations/YYYYMMDD_publish_engine.sql
```

### Modified Files (3)
```
web/prisma/schema.prisma                 # Add models
web/src/services/jobs.ts                 # Add publish job
web/src/components/sidebar.tsx           # Add /publishes link
```

---

## Implementation Order

1. **Schema** — Add `PublishAttempt`, `PublishHealth` models + migrate
2. **Engine** — Implement `PublishEngine` (no I/O, pure logic)
3. **Worker** — Implement `jobPublishScheduled()` + wire into cron
4. **Publisher** — Thin wrapper around `publishPhotoCarousel()`
5. **API** — CRUD endpoints for attempts + health
6. **Dashboard** — Basic live view (polling every 10s)
7. **Testing** — Integration tests with mock TikTok
8. **Deploy** — Update Netlify env vars, test with 1 account
9. **Scale** — Add 10 accounts, monitor for 1 week
10. **Iterate** — Add automation rules, campaigns, AI scheduling

---

**Estimated Total Effort:** 12–16 hours (P0 + P1 + Dashboard + Extensibility)

**Next Step:** Implement schema changes + core engine.
