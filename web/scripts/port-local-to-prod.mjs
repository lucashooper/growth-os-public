/**
 * Port local SQLite (prisma/dev.db) → production Supabase Postgres.
 * Does NOT regenerate Prisma (safe while `npm run dev` is running).
 *
 * Prerequisites:
 *   - Sign in once on production so User exists for OWNER_EMAIL
 *     OR set TARGET_USER_ID=<supabase auth uuid>
 *   - SUPABASE_DATABASE_URL = pooler URI in .env.local
 *
 * Usage:
 *   node scripts/port-local-to-prod.mjs
 *   node scripts/port-local-to-prod.mjs --dry-run
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import Database from "better-sqlite3";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const dryRun = process.argv.includes("--dry-run");
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
const APP_BASE = (
  process.env.APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
if (!OWNER_EMAIL && !process.env.TARGET_USER_ID?.trim()) {
  console.error("Set OWNER_EMAIL or TARGET_USER_ID before porting data.");
  process.exit(1);
}
const TARGET_USER_ID = process.env.TARGET_USER_ID?.trim() || "";
const PROD_URL = process.env.SUPABASE_DATABASE_URL || process.env.PROD_DATABASE_URL;
const DB_PATH = resolve(root, "prisma/dev.db");

if (!PROD_URL || !/^postgres(ql)?:\/\//i.test(PROD_URL)) {
  console.error("Set SUPABASE_DATABASE_URL (pooler) in .env.local");
  process.exit(1);
}

/** SQLite table → Postgres "Table" (Prisma default mapping) */
const TABLES = [
  "User",
  "Workspace",
  "WorkspaceMember",
  "SystemFlag",
  "Project",
  "ConnectedAccount",
  "PublishJob",
  "SyncLog",
  "Post",
  "DailyMetric",
  "Experiment",
  "Finding",
  "Conversation",
  "Message",
  "Setting",
  "LibraryAsset",
  "Competitor",
  "CompetitorPost",
  "QueueItem",
  "BrandPack",
  "ImagePack",
  "ImagePackAsset",
  "ContentFlow",
  "JobRun",
  "DevLog",
  "AiLog",
];

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

const DATE_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "startedAt",
  "finishedAt",
  "publishedAt",
  "scheduledAt",
  "date",
  "tokenExpiresAt",
  "oauthConnectedAt",
  "lastSyncAt",
]);

function coerceValue(key, v) {
  if (v === null || v === undefined) return null;
  if (DATE_KEYS.has(key) || /(?:At|Date)$/.test(key)) {
    if (typeof v === "number" || /^\d{10,13}$/.test(String(v))) {
      const n = Number(v);
      const ms = String(v).length <= 10 ? n * 1000 : n;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof v === "string" && v.trim()) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return v;
}

function coerceRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = coerceValue(k, v);
  }
  return out;
}

function pgValue(v) {
  if (v === null || v === undefined) return null;
  return v;
}

const sqlite = new Database(DB_PATH, { readonly: true });
const dump = {};
console.log(`Reading ${DB_PATH}`);
for (const table of TABLES) {
  try {
    dump[table] = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
  } catch (err) {
    console.warn(`  skip ${table}: ${err.message}`);
    dump[table] = [];
  }
  console.log(`  ${table}: ${dump[table].length}`);
}
sqlite.close();

const localUsers = dump.User;
const localOwner =
  localUsers.find((u) => String(u.email || "").toLowerCase() === OWNER_EMAIL) ||
  localUsers.find((u) => u.id === "dev-local-user") ||
  localUsers[0];

if (!localOwner) {
  console.error("No local user found.");
  process.exit(1);
}

if (dryRun) {
  console.log(`\n[dry-run] Would remap ${localOwner.id} → prod user for ${OWNER_EMAIL}`);
  console.log("No writes performed.");
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString: PROD_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function upsertRow(table, row, pk = "id", conflictCols = null) {
  const data = coerceRow(row);
  const cols = Object.keys(data);
  const values = cols.map((c) => pgValue(data[c]));
  const colSql = cols.map(quoteIdent).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const conflict = (conflictCols || [pk]).map(quoteIdent).join(", ");
  const skip = new Set(conflictCols || [pk]);
  const updates = cols
    .filter((c) => !skip.has(c))
    .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
    .join(", ");
  const sql = `
    INSERT INTO ${quoteIdent(table)} (${colSql})
    VALUES (${placeholders})
    ON CONFLICT (${conflict}) DO UPDATE SET ${
      updates || `${quoteIdent(pk)} = EXCLUDED.${quoteIdent(pk)}`
    }
  `;
  await query(sql, values);
}

try {
  let targetId = TARGET_USER_ID;
  let targetEmail = OWNER_EMAIL;

  if (!targetId) {
    const found = await query(
      `SELECT id, email FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
      [OWNER_EMAIL],
    );
    if (found.rows[0]) {
      targetId = found.rows[0].id;
      targetEmail = found.rows[0].email;
    }
  }

  if (!targetId) {
    console.error(
      `\nNo production User for ${OWNER_EMAIL}.\n` +
        `1) Sign in once at ${APP_BASE}/login\n` +
        `2) Re-run this script\n` +
        `   Or set TARGET_USER_ID=<auth.users uuid from Supabase>`,
    );
    process.exit(1);
  }

  console.log(`\nRemap ${localOwner.id} → ${targetId} (${targetEmail})`);

  const userIdMap = new Map();
  for (const u of localUsers) {
    const email = String(u.email || "").toLowerCase();
    if (
      u.id === localOwner.id ||
      email === OWNER_EMAIL ||
      u.id === "dev-local-user"
    ) {
      userIdMap.set(u.id, targetId);
    } else {
      userIdMap.set(u.id, u.id);
    }
  }
  const mapUser = (id) => userIdMap.get(id) || id;

  // Ensure owner user row
  await upsertRow("User", {
    id: targetId,
    email: OWNER_EMAIL,
    name: localOwner.name || "Lucas",
    avatarUrl: localOwner.avatarUrl || "",
    createdAt: localOwner.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  for (const u of localUsers) {
    const id = mapUser(u.id);
    if (id === targetId) continue;
    await upsertRow("User", {
      ...u,
      id,
      updatedAt: u.updatedAt || new Date().toISOString(),
    });
  }
  console.log("  User ok");

  for (const table of TABLES) {
    if (table === "User") continue;
    let rows = dump[table].map((raw) => {
      const row = { ...raw };
      if ("userId" in row) row.userId = mapUser(row.userId);
      return row;
    });

    // After user remap, two memberships can collapse onto one pair
    if (table === "WorkspaceMember") {
      const seen = new Set();
      rows = rows.filter((r) => {
        const k = `${r.workspaceId}:${r.userId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    let n = 0;
    for (const row of rows) {
      if (table === "SystemFlag") {
        await upsertRow(table, row, "key", ["key"]);
      } else if (table === "WorkspaceMember") {
        await upsertRow(table, row, "id", ["workspaceId", "userId"]);
      } else if (table === "Setting") {
        await upsertRow(table, row, "id", ["workspaceId", "key"]);
      } else if (table === "DailyMetric") {
        await upsertRow(table, row, "id", ["projectId", "date"]);
      } else {
        await upsertRow(table, row, "id", ["id"]);
      }
      n++;
    }
    console.log(`  ${table}: ${n}`);
  }

  // Clean empty starter workspaces not in local dump
  const importedWs = new Set(dump.Workspace.map((w) => w.id));
  const memberships = await query(
    `SELECT w.id, w.name, w.slug,
            COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END),0)::int AS projects,
            COALESCE((
              SELECT COUNT(*) FROM "Post" po
              JOIN "Project" pr ON pr.id = po."projectId"
              WHERE pr."workspaceId" = w.id
            ),0)::int AS posts,
            COALESCE((
              SELECT COUNT(*) FROM "ConnectedAccount" a
              JOIN "Project" pr ON pr.id = a."projectId"
              WHERE pr."workspaceId" = w.id
            ),0)::int AS accounts
     FROM "Workspace" w
     JOIN "WorkspaceMember" m ON m."workspaceId" = w.id
     LEFT JOIN "Project" p ON p."workspaceId" = w.id
     WHERE m."userId" = $1
     GROUP BY w.id`,
    [targetId],
  );

  for (const ws of memberships.rows) {
    if (importedWs.has(ws.id)) continue;
    if (ws.posts === 0 && ws.accounts === 0) {
      await query(`DELETE FROM "Workspace" WHERE id = $1`, [ws.id]);
      console.log(`  cleaned empty workspace ${ws.name}`);
    }
  }

  const summary = await query(
    `SELECT
       (SELECT COUNT(*) FROM "Project")::int AS projects,
       (SELECT COUNT(*) FROM "ConnectedAccount")::int AS accounts,
       (SELECT COUNT(*) FROM "Post")::int AS posts`,
  );
  console.log("\nDone.", summary.rows[0]);
  console.log(`Hard-refresh ${APP_BASE} — pick the imported project in the sidebar.`);
} finally {
  await pool.end();
}
