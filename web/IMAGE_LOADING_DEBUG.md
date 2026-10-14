# Image Loading Debug & Project Renaming

## Project Name Editing

Added the ability to rename projects directly from the Projects page.

### Changes

**API Endpoint** - `src/app/api/projects/[id]/route.ts`
- Added `PATCH` handler to update project `name`, `description`, and `color`
- Validates project access before allowing updates

**UI** - `src/app/(app)/projects/page.tsx`
- Added inline editing mode with edit icon button
- Shows form with name and description inputs
- Save/Cancel buttons for confirmation
- State management for editing mode
- Calls PATCH endpoint to persist changes
- Refreshes project list after successful save

### Usage

1. Click the edit icon (pencil) on any project card
2. Update the name and/or description
3. Click "Save" to persist changes or "Cancel" to discard

---

## Image Loading Debug Logging

Added comprehensive logging to track why images aren't loading and when placeholders are being used.

### Problem

User reported seeing placeholder images in many places despite images being uploaded. Need detailed logging to understand:
1. Are `coverUrl` values being returned from the API?
2. Are images failing to load due to CORS, 404, or other errors?
3. When are placeholders being used vs actual images?

### Logging Added

#### 1. **API Level** - `src/app/api/posts/route.ts`
```typescript
console.log("[posts API] Image statistics:", {
  total: posts.length,
  withCoverUrl: posts.filter((p) => p.coverUrl).length,
  withoutCoverUrl: posts.filter((p) => !p.coverUrl).length,
  sampleCoverUrls: posts.slice(0, 3).map((p) => ({
    id: p.id,
    hook: p.hook?.substring(0, 30),
    hasCoverUrl: Boolean(p.coverUrl),
    coverUrlLength: p.coverUrl?.length || 0,
  })),
});
```

Shows:
- Total posts returned
- How many have vs don't have coverUrl
- Sample of first 3 posts with their image status

#### 2. **Analytics Service** - `src/services/analytics.ts`
```typescript
console.log("[analytics toSnapshot] Converting post:", {
  id: p.id,
  hook: p.hook?.substring(0, 30),
  hasCoverUrl: Boolean(p.coverUrl),
  coverUrlLength: p.coverUrl?.length || 0,
});
```

Logs each post as it's converted to a snapshot for the analytics page.

#### 3. **Analytics Page** - `src/app/(app)/analytics/page.tsx`
```typescript
console.log("[Analytics] Loaded report:", {
  totalTopPosts: res.data.report.topPosts.length,
  topPostsWithImages: topPostsWithImages.length,
  totalBottomPosts: res.data.report.bottomPosts.length,
  bottomPostsWithImages: bottomPostsWithImages.length,
  sampleTopPost: { ... },
});
```

Shows summary of posts loaded and how many have images.

#### 4. **PostCard Component** - `src/components/post-card.tsx`
```typescript
// On mount
console.log("[PostCard] Image loading:", {
  postId: post.id,
  hook: post.hook?.substring(0, 30),
  hasImage,
  imageSource: hasImage ? post.coverUrl : `placeholder(...)`,
  imageLength: post.coverUrl?.length || 0,
});

// On successful load
console.log("[PostCard] Image loaded successfully:", post.id);

// On error
console.error("[PostCard] Image failed to load:", {
  postId: post.id,
  coverUrl: post.coverUrl,
  error: e.type,
});
```

Tracks:
- Every post card render
- Which images load successfully
- Which images fail and why

#### 5. **Placeholder Generator** - `src/lib/placeholder-image.ts`
```typescript
console.log("[placeholder-image] Generating placeholder:", {
  seed: seed?.substring(0, 30),
  hash,
  gradientIndex: hash % gradients.length,
  colors: [color1, color2],
});
```

Shows when placeholders are being generated and for which posts.

### Type Fixes

Fixed nullable `coverUrl` types throughout the codebase:

1. **`src/services/analytics.ts`**
   - Changed `PostSnapshot.coverUrl` from `string` to `string | null`
   - Changed `PostSnapshot.shareUrl` from `string` to `string | null`
   - Updated `toSnapshot` function parameter types
   - Added logging to track conversions

2. **`src/app/api/conversations/[id]/messages/route.ts`**
   - Added explicit type annotation for `competitorCards` array
   - Specified `coverUrl: string | null` and `shareUrl: string | null` in posts
   - Ensures type compatibility between DB query results and fallback assignments

3. **`src/components/post-card.tsx`**
   - Added `onError` handler to img tag
   - Falls back to placeholder on image load failure
   - Logs all image loading events

### How to Debug

1. Open the app in the browser
2. Open DevTools console
3. Navigate to pages with images (Analytics, Library, etc.)
4. Check console logs for:
   - `[posts API]` - What's coming from the database
   - `[analytics toSnapshot]` - What's being processed
   - `[Analytics]` - What the page received
   - `[PostCard]` - Individual image loading
   - `[placeholder-image]` - When placeholders are used
   - `[PostCard] Image failed to load` - Specific errors

### Expected Output

For posts **with** images:
```
[posts API] Image statistics: { total: 10, withCoverUrl: 8, withoutCoverUrl: 2, ... }
[PostCard] Image loading: { postId: "abc", hasImage: true, imageSource: "https://..." }
[PostCard] Image loaded successfully: abc
```

For posts **without** images:
```
[PostCard] Image loading: { postId: "xyz", hasImage: false, imageSource: "placeholder(...)" }
[placeholder-image] Generating placeholder: { seed: "...", colors: [...] }
```

For posts with **broken** images:
```
[PostCard] Image loading: { postId: "def", hasImage: true, imageSource: "https://broken.url" }
[PostCard] Image failed to load: { postId: "def", coverUrl: "https://broken.url", error: "error" }
[placeholder-image] Generating placeholder: { seed: "...", colors: [...] }
```

### Next Steps

Once you've gathered the console logs:

1. **If `withCoverUrl: 0`**: Images aren't being saved to the database during post creation
2. **If images fail to load**: Check for CORS errors, 404s, or invalid URLs
3. **If placeholders show immediately**: `coverUrl` is null/undefined in the API response
4. **If images load then fail**: Network issue or hosting problem

This comprehensive logging will pinpoint exactly where the image loading pipeline breaks down.

---

## Files Changed

1. `src/app/api/projects/[id]/route.ts` - Added PATCH endpoint for project updates
2. `src/app/(app)/projects/page.tsx` - Added inline editing UI for project names
3. `src/app/api/posts/route.ts` - Added image statistics logging
4. `src/services/analytics.ts` - Made coverUrl/shareUrl nullable, added logging
5. `src/app/(app)/analytics/page.tsx` - Added report image statistics logging
6. `src/components/post-card.tsx` - Added comprehensive image loading logs and error handler
7. `src/lib/placeholder-image.ts` - Added placeholder generation logging
8. `src/app/api/conversations/[id]/messages/route.ts` - Fixed type compatibility for nullable URLs

---

## Testing

1. **Project Renaming**:
   - Navigate to `/projects`
   - Click edit icon on a project
   - Change the name/description
   - Save and verify it persists

2. **Image Debug Logging**:
   - Open DevTools console
   - Navigate to any page with post cards (Analytics, Library)
   - Check console for image loading logs
   - Look for errors or patterns indicating why images aren't loading

---

## Build Status

✅ TypeScript compilation passes (`npx tsc --noEmit`)
⚠️ Full build blocked by Prisma DLL locking issue (Windows-specific, doesn't affect functionality)
