import "server-only";
import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getAccessibleProjectIds,
  getAccessibleWorkspaceIds,
  provisionUserWorkspace,
  userCanAccessProject,
  userCanAccessWorkspace,
} from "@/services/tenancy";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
};

/**
 * Dev-only bypass when Supabase is not configured.
 * Set AUTH_DEV_BYPASS=1 and OWNER_EMAIL to use a synthetic local user.
 */
async function devBypassUser(): Promise<AuthUser | null> {
  if (process.env.AUTH_DEV_BYPASS !== "1") return null;
  if (isSupabaseConfigured()) return null;
  const email = (process.env.OWNER_EMAIL || "dev@localhost").toLowerCase();
  const id = process.env.OWNER_USER_ID || "dev-local-user";
  await provisionUserWorkspace({ id, email, name: "Local Dev" });
  return { id, email, name: "Local Dev", avatarUrl: "" };
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const bypass = await devBypassUser();
  if (bypass) return bypass;

  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    const { logger } = await import("@/lib/logger");
    logger.warn("auth", "supabase getUser failed", { message: error.message });
    return null;
  }
  const user = data.user;
  if (!user?.email) return null;

  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name:
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email.split("@")[0],
    avatarUrl: (user.user_metadata?.avatar_url as string) || "",
  };

  await provisionUserWorkspace(authUser);
  return authUser;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Safe across bundled copies of the AuthError class. */
export function isAuthError(err: unknown): err is AuthError {
  if (err instanceof AuthError) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "AuthError" &&
    typeof (err as { status?: unknown }).status === "number" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

export function authFail(err: unknown) {
  if (isAuthError(err)) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unauthorized";
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  const ok = await userCanAccessProject(user.id, projectId);
  if (!ok) throw new AuthError("Forbidden", 403);
  return user;
}

export async function requireWorkspaceAccess(workspaceId: string) {
  const user = await requireUser();
  const ok = await userCanAccessWorkspace(user.id, workspaceId);
  if (!ok) throw new AuthError("Forbidden", 403);
  return user;
}

export async function listUserProjectIds(userId: string) {
  return getAccessibleProjectIds(userId);
}

export async function listUserWorkspaceIds(userId: string) {
  return getAccessibleWorkspaceIds(userId);
}
