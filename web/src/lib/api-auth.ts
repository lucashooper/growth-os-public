import "server-only";
import {
  AuthError,
  authFail,
  isAuthError,
  requireProjectAccess,
  requireUser,
  requireWorkspaceAccess,
} from "@/lib/auth";

export {
  AuthError,
  authFail,
  isAuthError,
  requireProjectAccess,
  requireUser,
  requireWorkspaceAccess,
};

/** Extract projectId from query or JSON body and enforce membership. */
export async function guardProjectId(projectId: string | null | undefined) {
  if (!projectId) throw new AuthError("projectId required", 400);
  return requireProjectAccess(projectId);
}
