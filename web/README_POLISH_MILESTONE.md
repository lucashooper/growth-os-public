# Product Polish & Performance Milestone

## Status: IN PROGRESS

This document tracks the product-polish and performance optimization milestone focused on making Growth OS feel instant, frictionless, and production-ready.

---

## ✅ COMPLETED

### 1. Diagnostics Page (DONE)
**Goal**: Eliminate guesswork about TikTok app approval status and OAuth configuration.

**Implementation**:
- Created `/diagnostics` page with comprehensive TikTok integration diagnostics
- Shows active client key (sandbox vs production detection)
- Displays environment variables and OAuth redirect URI
- Shows all connected accounts with token status and scopes
- Displays recent publish attempts and job history
- Generates actionable recommendations (e.g., "Update to production key", "Expired tokens")
- Added "Inspect" button for per-account creator info and privacy options
- Linked from sidebar under "System" section

**Files Added/Modified**:
- `web/src/app/api/tiktok/diagnostics/route.ts` - API endpoint for diagnostics data
- `web/src/app/(app)/diagnostics/page.tsx` - Diagnostics UI page
- `web/src/components/sidebar.tsx` - Added Diagnostics link

---

### 2. Quick Publish Mode (DONE)
**Goal**: Add saved publishing preferences with optional "Skip confirmation" for one-click publishing.

**Implementation**:
- Created `PublishPreferences` storage system using localStorage per account
- Added Quick Publish UI section in publish modal with:
  - "Save publishing preferences" checkbox
  - "Skip confirmation (one-click publish)" checkbox when preferences exist
  - Preferences include: privacy, allowComment, autoMusic, commercial, yourBrand, branded, skipConfirmation
- When Quick Publish mode is active and skip confirmation enabled:
  - Shows simplified one-click "Quick Publish" button with lightning icon
  - Bypasses consent checkbox (preferences act as standing consent)
  - Auto-fills all settings from saved preferences
- When Quick Publish mode inactive or skip confirmation disabled:
  - Shows standard 3-button layout (Cancel, Save as draft, Post now)
  - Requires explicit consent checkbox

**Files Added/Modified**:
- `web/src/lib/publish-preferences.ts` - Preferences storage utilities
- `web/src/components/tiktok-publish-modal.tsx` - Updated with Quick Publish UI and logic

---

### 3. Simplified Connected Accounts Page (DONE)
**Goal**: Replace developer instructions with a clean publishing status card. Move OAuth/URL/troubleshooting docs into expandable "Advanced" section.

**Implementation**:
- Created `PublishingStatusCard` component with:
  - Green checkmark + count when accounts are connected for publishing
  - Warning icon when no accounts connected
  - Clear, action-oriented messaging (what user can do next)
  - "Show Advanced" / "Hide Advanced" toggle button
- Advanced section (collapsible) contains:
  - Developer setup instructions (OAuth, env vars)
  - URL ownership verification instructions
  - Troubleshooting guidance
  - Link to Diagnostics page
- Replaced old verbose blue card with clean, minimal status card
- Removed unused `showAdvanced` state after component extraction

**Files Added/Modified**:
- `web/src/app/(app)/accounts/PUBLISHING_STATUS.tsx` - New publishing status card component
- `web/src/app/(app)/accounts/page.tsx` - Integrated status card, removed old instructions

---

### 4. Performance Infrastructure (PARTIAL)
**Goal**: Build foundation for performance monitoring, caching, prefetching, and skeleton loading.

**Implementation**:
- Created `web/src/lib/performance.ts` with:
  - `startMeasure()` / `endMeasure()` for timing instrumentation
  - Metrics collection and summary statistics
  - In-memory cache with TTL (`getCached`, `setCached`, `clearCache`)
  - Prefetch utilities (`prefetchUrl`, `prefetchData`)
  - Enable/disable perf logging via localStorage
- Created `web/src/components/skeleton.tsx` with:
  - Base `Skeleton` component
  - Specialized skeletons: `CardSkeleton`, `MetricSkeleton`, `PostCardSkeleton`, `TableSkeleton`, `ChartSkeleton`

**Files Added**:
- `web/src/lib/performance.ts`
- `web/src/components/skeleton.tsx`

**Status**: Infrastructure ready, but **NOT YET APPLIED** to pages. See "Remaining Work" section below.

---

## 🚧 REMAINING WORK

### 5. Performance Audit - Apply Optimizations
**Status**: INFRASTRUCTURE READY, NOT YET APPLIED TO PAGES

**Next Steps**:
1. **Add performance instrumentation to key pages**:
   - Dashboard: Measure time to first metric, parallel data fetching
   - Analytics: Measure chart rendering, API call timings
   - Generator: Measure slide rendering, AI generation time
   - Library: Measure post grid loading
   - Publish Pipeline: Full end-to-end timing (see task 6 below)

2. **Convert sequential requests to parallel**:
   - Identify pages making multiple sequential API calls
   - Use `Promise.all()` or parallel React Query/SWR fetches
   - Example: Dashboard likely fetches metrics, experiments, posts separately — can be parallel

3. **Add caching**:
   - Use `getCached`/`setCached` from `performance.ts` for frequently accessed data
   - Cache analytics data, connected accounts, project settings
   - Implement stale-while-revalidate pattern

4. **Add prefetching**:
   - After login, prefetch `/dashboard` and `/generate` data
   - Add `prefetchData()` calls on hover or route change hints
   - Prefetch next page in paginated lists

5. **Replace loading states with skeletons**:
   - Replace `<LoadingBlock />` with appropriate skeleton components
   - Add skeleton screens to: Dashboard, Analytics, Library, Queue, Publishes, Accounts
   - Ensure skeletons match final layout for smooth transitions

6. **Image optimization**:
   - Generate thumbnails for uploaded images (already mentioned in design)
   - Lazy load images in content library
   - Use Next.js Image component where applicable (if using client-side rendering)
   - Add blur placeholders for post covers

7. **Minimize re-renders**:
   - Audit components for unnecessary re-renders using React DevTools Profiler
   - Add `React.memo()` to heavy components
   - Use `useMemo()` and `useCallback()` where appropriate
   - Check for prop drilling and context updates causing cascading re-renders

---

### 6. Profile Publish Pipeline End-to-End
**Status**: NOT STARTED

**Goal**: Measure upload time, TikTok API initialization, polling, and completion to identify bottlenecks.

**Implementation Plan**:
1. **Add timing instrumentation to publish pipeline**:
   - In `tiktok-publish-modal.tsx`:
     - Measure slide rendering time
     - Measure image upload time (per image and total)
     - Measure TikTok API call time (init + publish)
     - Measure polling duration (for async publish jobs)
   - In `publish-worker.ts`:
     - Measure time from job pickup to completion
     - Measure rate limit checks
     - Measure retry delays

2. **Add timing display to UI**:
   - Show progress with timing estimates ("Uploading 3/5 images... 2.1s")
   - After publish completion, show timing breakdown:
     - "Rendered slides: 0.8s"
     - "Uploaded images: 4.2s"
     - "TikTok API: 1.5s"
     - "Total: 6.5s"
   - Store timing data in `PublishAttempt.metaJson`

3. **Identify bottlenecks**:
   - If image upload is slow: Check Supabase storage performance, consider compression
   - If TikTok API is slow: Check if images are being pulled correctly, verify URL ownership
   - If polling is slow: Optimize polling intervals, add exponential backoff

4. **Optimization targets**:
   - Image uploads should complete in <5s for typical 5-image carousel
   - TikTok API calls should complete in <3s
   - Total publish time should be <10s for most posts

**Files to Modify**:
- `web/src/components/tiktok-publish-modal.tsx` - Add timing UI and measurements
- `web/src/services/publish-worker.ts` - Add job timing
- `web/src/services/publish-engine.ts` - Log timing to metaJson

---

### 7. AI Action Centre
**Status**: NOT STARTED

**Goal**: Daily AI recommendations that synthesize analytics, experiments, competitor intelligence, posting windows, and hook performance into ranked actions with confidence scores.

**Implementation Plan**:
1. **Create data aggregation service** (`web/src/services/action-centre.ts`):
   - Fetch latest analytics (views, engagement, growth trends)
   - Check experiment results and winners
   - Pull competitor intelligence from Deep Intelligence system
   - Analyze posting time performance (best windows)
   - Evaluate hook performance from recent posts
   
2. **AI recommendation engine**:
   - Generate actions based on patterns:
     - "Post between 6-8 PM EST — 35% higher engagement (confidence: 87%)"
     - "Test Hook #42 — similar creators saw 2.3x views (confidence: 72%)"
     - "Competitor @example posted 3x this week — consider increasing cadence (confidence: 65%)"
     - "Experiment 'CTA Button' is winning — publish winning variant (confidence: 95%)"
   - Score each action by:
     - Confidence (data quality, sample size)
     - Expected impact (estimated views/engagement lift)
     - Ease of execution (1-click vs manual work)
   
3. **Create UI page** (`web/src/app/(app)/action-centre/page.tsx`):
   - Show date and last updated time
   - Display ranked list of 5-10 actions
   - Each action card shows:
     - Icon (based on action type)
     - Title (clear, actionable)
     - Description (why this matters)
     - Confidence score (visual indicator)
     - Expected impact ("+15% views", "2.3x engagement")
     - Action button ("Create Post", "View Experiment", "Analyze Competitor", etc.)
   - Sort by confidence × impact score
   
4. **Add to navigation**:
   - Add "Action Centre" link to sidebar under "Primary" section
   - Show badge with action count
   
5. **Refresh strategy**:
   - Regenerate actions daily at midnight (background job)
   - Allow manual refresh
   - Cache results for 24 hours

**Files to Create**:
- `web/src/services/action-centre.ts` - Data aggregation and recommendation logic
- `web/src/app/api/action-centre/route.ts` - API endpoint
- `web/src/app/(app)/action-centre/page.tsx` - UI page
- `web/src/components/action-card.tsx` - Reusable action card component

**Files to Modify**:
- `web/src/components/sidebar.tsx` - Add Action Centre link
- `web/src/services/jobs.ts` - Add daily action regeneration job

---

## Testing Checklist

### Diagnostics
- [ ] Visit `/diagnostics` page
- [ ] Verify environment section shows correct values
- [ ] Verify TikTok app configuration detects sandbox vs production correctly
- [ ] Check recommendations appear when using sandbox key
- [ ] Test "Inspect" button on account card
- [ ] Verify recent attempts/jobs are listed

### Quick Publish
- [ ] Open publish modal from Generator
- [ ] Check "Save publishing preferences"
- [ ] Publish once to save preferences
- [ ] Close and reopen modal — verify preferences are auto-filled
- [ ] Enable "Skip confirmation" checkbox
- [ ] Verify "Quick Publish" button appears
- [ ] Click "Quick Publish" — should publish without additional confirmation
- [ ] Test on different accounts — preferences should be per-account

### Connected Accounts
- [ ] Visit `/accounts` page
- [ ] Verify "Publishing Status" card shows correct count
- [ ] Verify status changes from warning to success when account connected
- [ ] Click "Show Advanced" — verify developer docs expand
- [ ] Click "Hide Advanced" — verify docs collapse
- [ ] Verify old verbose instructions are gone

### Performance (When Applied)
- [ ] Enable perf logging: `localStorage.setItem("growthOS:perf", "true")`
- [ ] Navigate to Dashboard — check console for timing logs
- [ ] Verify skeleton screens appear before data loads
- [ ] Test parallel data loading on pages with multiple API calls
- [ ] Verify cache hits on repeated navigation

---

## Deployment Notes

### Environment Variables
Ensure these are set in Netlify for production:
- `TIKTOK_CLIENT_KEY` - **Production key** (starts with `aw...`)
- `TIKTOK_CLIENT_SECRET` - Production secret
- `APP_BASE_URL` - your public site origin, for example `https://your-domain.example`

### Post-Deployment Verification
1. Visit `/diagnostics` — should show "PRODUCTION (Approved)" mode
2. Connect a TikTok account via OAuth
3. Test Quick Publish with saved preferences
4. Verify Diagnostics page shows correct token scopes and expiry

---

## Performance Targets

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| Dashboard load (p50) | <500ms | TBD | First metric visible |
| Generator render | <200ms | TBD | Slide preview ready |
| Publish (5 images) | <10s | TBD | Upload + TikTok API |
| Library page load | <400ms | TBD | Post grid with thumbnails |
| Time to interactive | <2s | TBD | All pages |

---

## Next Steps Priority
1. ✅ Diagnostics (DONE)
2. ✅ Quick Publish (DONE)
3. ✅ Simplified Accounts (DONE)
4. 🚧 Apply performance optimizations to pages (IN PROGRESS - infrastructure ready)
5. 🔲 Profile publish pipeline
6. 🔲 AI Action Centre

---

## Notes
- All completed work is fully functional and ready for testing
- Performance infrastructure is built but needs to be applied to individual pages
- Remaining work is well-scoped and can be completed incrementally
- Focus on measuring first (profile pipeline) before over-optimizing
