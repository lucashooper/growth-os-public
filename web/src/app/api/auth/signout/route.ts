import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withApi } from "@/lib/api-route";

async function handlePOST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieStore = await cookies();
  const redirectTo = new URL("/login", request.url);

  if (!url || !key) {
    return NextResponse.redirect(redirectTo);
  }

  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.signOut();

  // Also drop any leftover sb-* cookies in case signOut missed chunks
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-") || c.name.includes("auth-token")) {
      response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
    }
  }

  return response;
}

async function handleGET(request: Request) {
  return handlePOST(request);
}

export const POST = withApi(handlePOST, "POST src/app/api/auth/signout/route.ts");
export const GET = withApi(handleGET, "GET src/app/api/auth/signout/route.ts");
