import pg from "pg";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!url || !/^postgres/i.test(url)) {
  console.error("Need SUPABASE_DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
await client.query(`
  ALTER TABLE "ConnectedAccount"
  ADD COLUMN IF NOT EXISTS "userId" TEXT NOT NULL DEFAULT '';
`);
await client.query(`
  CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx"
  ON "ConnectedAccount"("userId");
`);
console.log("ConnectedAccount.userId ready");
await client.end();
