import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight edge middleware — no Supabase/Prisma imports.
 * Heavy auth runs in Node (app layout + API requireUser).
 * Do NOT redirect login/signup based on cookie presence alone:
 * stale sb-* cookies cause an infinite /login ↔ /agent loop when
 * the refresh token is invalid.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const isApi = pathname.startsWith("/api/");
  const verbose = process.env.NODE_ENV !== "production";

  // A trailing slash on Supabase's Site URL makes email links like
  // https://host//auth/confirm — collapse repeated slashes so they still route.
  if (pathname.includes("//")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/{2,}/g, "/");
    return NextResponse.redirect(url, 308);
  }

  if (isApi || verbose) {
    console.log(`[mw] ${method} ${pathname}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
