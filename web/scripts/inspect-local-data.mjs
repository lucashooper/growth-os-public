/**
 * Inspect local SQLite data counts (no Prisma generate).
 * Usage: node scripts/inspect-local-data.mjs
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = resolve(root, "prisma/dev.db");
const db = new Database(DB_PATH, { readonly: true });

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY 1`)
  .all()
  .map((r) => r.name);

const counts = {};
for (const t of tables) {
  counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
}
const users = db.prepare(`SELECT id, email, name FROM "User"`).all();
const projects = db
  .prepare(`SELECT id, name, slug, "workspaceId" FROM "Project"`)
  .all();

console.log(JSON.stringify({ users, projects, counts }, null, 2));
db.close();
