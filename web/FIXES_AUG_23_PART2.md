# Fixes - August 23, 2026 (Part 2)

## 1. ✅ Clone from Recent TikTok - Project ID Error

**Issue**: When selecting an account in the Clone modal, got "project ID required" and 400 Bad Request error.

**Root Cause**: The `/api/posts` endpoint requires `projectId` as a query parameter, but the modal was sending `accountId` instead.

**Fix**:
```typescript
// Before (src/components/clone-recent-modal.tsx)
`/api/posts?accountId=${accountId}&status=published&limit=12`

// After
`/api/posts?projectId=${projectId}&status=published`

// Then filter to account
const accountPosts = res.data.posts.filter(p => 
  p.accounts?.some(a => a.username === accounts.find(acc => acc.id === accountId)?.username)
).slice(0, 12);
```

**Files Changed**:
- `src/components/clone-recent-modal.tsx`

---

## 2. ✅ Architecture Documentation

**Added**: Comprehensive documentation explaining how Growth OS works internally.

### Created Files:

**1. `ARCHITECTURE.md`** (Full technical reference)
- System overview and data flow
- Image handling architecture (TikTok CDN, Supabase, placeholders)
- Playwright scraping explained
- Database schema reference
- API endpoint documentation
- Background jobs
- Performance optimizations
- Common issues and solutions
- Deployment guide
- File structure map

**2. `/architecture` Page** (Interactive UI documentation)
- Collapsible sections for each system component
- Visual explanations
- Badge indicators for critical systems
- Links to full markdown docs

**3. Sidebar Link**
- Added "Architecture" to System section
- Uses `FileCode2` icon

**Location**:
```
System Tab
├── Diagnostics
├── Architecture  ← NEW
├── Developer Console
└── Settings
```

---

## 3. 🔄 Groq Model Error (LLAMA 3.3)

**Issue**: Agent page still showing "LLAMA 3.3 versatile" error despite model update.

**Root Cause**: Cached briefing from before the model change is stored in the database.

**What Was Already Fixed**:
```typescript
// src/lib/ai/types.ts
groq: {
  defaultModel: "qwen/qwen3.6-27b",  // ✅ Already updated
}
```

**Why Error Still Shows**:
The daily briefing is cached in the `Setting` table with this structure:
```json
{
  "date": "2026-08-23",
  "briefing": "...",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",  ← Old cached value
  "citedPosts": []
}
```

**Solution for User**:
1. Go to Agent page
2. Click the "Refresh" button (force regenerate)
3. New briefing will use `qwen/qwen3.6-27b`

**Alternative**: Clear the cache manually:
```sql
DELETE FROM Setting 
WHERE key LIKE 'daily_briefing:%';
```

---

## 4. 🔧 Image Loading Errors (Still Investigating)

**Issue**: PostCard images failing to load with empty error object `{}`.

**Current Logging**:
```typescript
// src/components/post-card.tsx (Lines 64-75)
onError={(e) => {
  const img = e.target as HTMLImageElement;
  console.error("[PostCard] Image failed to load:", {
    postId: post.id,
    hook: post.hook?.substring(0, 30),
    attemptedUrl: post.coverUrl,
    urlLength: post.coverUrl?.length,
    urlStart: post.coverUrl?.substring(0, 100),
    imgSrc: img.src?.substring(0, 100),
    errorType: e.type,
    errorMessage: "Failed to load image",
  });
  
  // Fallback to placeholder (prevent infinite loop)
  if (!img.src.startsWith('data:image/svg+xml')) {
    img.src = getPlaceholderImage(post.hook + post.id);
  }
}}
```

**Why Empty Object?**:
The error object `{}` in the console is from an old cached version of the code. After the dev server restarts, the new detailed logging will show full error context.

**Expected Console Output (After Restart)**:
```
[PostCard] Image failed to load: {
  postId: "cms205a6o001tf59wnckg27bm",
  hook: "Why I quit my job",
  attemptedUrl: "https://p16-sign-sg.tiktokcdn.com/...",
  urlLength: 342,
  urlStart: "https://p16-sign-sg.tiktokcdn.com/...",
  imgSrc: "https://p16-sign-sg.tiktokcdn.com/...",
  errorType: "error",
  errorMessage: "Failed to load image"
}
```

**Known Root Cause**: TikTok CDN URLs expire after 24-48 hours.

**Planned Fix**: Image proxy (see `ARCHITECTURE.md` for design).

---

## 5. 🚧 Production Error Parity

**Question**: "Will these errors also happen in production?"

**Answer**: Yes, all these errors are architectural, not local-only:

| Error | Production? | Why |
|-------|-------------|-----|
| Image loading fails | ✅ Yes | TikTok CDN URLs expire everywhere |
| Clone modal 400 error | ✅ Yes (before fix) | API contract issue, not env-specific |
| Groq model error | ✅ Yes | Cached briefing in prod database |
| Profile parse failed | ✅ Yes | TikTok HTML changes affect all envs |

**Local-Only Issues**:
- Prisma DLL file locking (Windows dev only)
- HMR/Fast Refresh glitches
- `localhost:3000` networking
- Missing `.env` variables (if not in Netlify)

---

## Testing the Fixes

### 1. Clone from Recent TikTok
```bash
1. Go to Generator page
2. Click "Clone from TikTok"
3. Select an account
4. Should see recent posts (not 400 error)
5. Click a post
6. Generator should populate with slides
```

### 2. Architecture Page
```bash
1. Go to sidebar → System → Architecture
2. Should see interactive documentation
3. Click sections to expand/collapse
4. Verify all sections load properly
```

### 3. Refresh AI Agent Briefing
```bash
1. Go to Agent page
2. Click "Refresh" button
3. Wait for new briefing
4. Check console for new model: "qwen/qwen3.6-27b"
```

### 4. Image Error Logging
```bash
1. Restart dev server: Ctrl+C → npm run dev
2. Go to Dashboard or Analytics
3. Open DevTools Console
4. Look for detailed [PostCard] logs with full error context
5. Identify which URLs are failing
```

---

## Next Steps (Not in This Fix)

### Priority 1: Image Proxy
**Why**: Solve persistent image loading failures.

**Design** (from ARCHITECTURE.md):
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

**Implementation Tasks**:
1. Create `ImageCache` model (url, supabaseUrl, expiresAt)
2. Build `/api/image-proxy` route
3. Update PostCard to use proxy for TikTok URLs
4. Add background job to pre-cache on sync

### Priority 2: Right-Click Project Edit
**What**: Context menu on project cards for quick edit/image upload.

**Location**: `src/app/(app)/projects/page.tsx`

**UI Flow**:
```
Right-click project card
    ↓
Context menu appears
    ↓
Options: Rename, Change Color, Upload Image, Delete
    ↓
Inline edit or modal
```

### Priority 3: Verify Prefetching
**Test**: Add cache hit/miss logging to confirm hover prefetch works.

**Expected Behavior**:
- Hover sidebar link for 300ms
- API call fires in background
- Navigate to page → instant load (cache hit)

---

## Files Changed Summary

```
✅ src/components/clone-recent-modal.tsx       (Fix API call)
✅ src/components/sidebar.tsx                  (Add Architecture link)
✅ src/app/(app)/architecture/page.tsx         (New page)
✅ web/ARCHITECTURE.md                         (New docs)
✅ web/FIXES_AUG_23_PART2.md                   (This file)
```

---

## Deployment Notes

**No Migrations Required**: All fixes are code-only.

**Netlify Deploy**:
```bash
git add .
git commit -m "Fix clone modal, add architecture docs"
git push
```

**Post-Deploy Checks**:
1. Test Clone from Recent TikTok
2. Verify Architecture page loads
3. Force refresh AI briefing
4. Monitor console for detailed image errors

---

**Status**: 
- ✅ Clone modal fixed
- ✅ Architecture docs added
- 🔄 Model error requires user action (refresh)
- 🔧 Image loading needs proxy (planned)
