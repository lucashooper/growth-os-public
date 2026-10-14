/**
 * Canonical Prisma singleton (alias of `@/lib/db`).
 * Prefer importing from here or `@/lib/db` — never `new PrismaClient()` in routes.
 */
export { prisma, checkPrismaConnection, normalizeDatabaseUrl } from "@/lib/db";
