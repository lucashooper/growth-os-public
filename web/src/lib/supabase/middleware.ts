import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-safe session refresh. Logs auth failures; never throws.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      `[auth] supabase env missing url=${Boolean(url)} anon=${Boolean(key)} path=${request.nextUrl.pathname}`,
    );
    return { response: supabaseResponse, user: null as null };
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn(
        `[auth] getUser failed path=${request.nextUrl.pathname} message=${error.message}`,
      );
      return { response: supabaseResponse, user: null };
    }

    return { response: supabaseResponse, user: data.user };
  } catch (err) {
    console.error(
      `[auth] updateSession crashed path=${request.nextUrl.pathname}`,
      err instanceof Error ? err.stack || err.message : err,
    );
    return { response: NextResponse.next({ request }), user: null };
  }
}
