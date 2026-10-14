/**
 * Upload local public/uploads/* to Supabase Storage and rewrite DB URLs.
 *
 * Usage: node scripts/sync-uploads-to-supabase.mjs
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DATABASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DATABASE_URL;
const bucket = "uploads";

if (!supabaseUrl || !serviceKey || !dbUrl) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DATABASE_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === bucket)) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 40 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error("createBucket", error.message);
    process.exit(1);
  }
  console.log("Created public bucket:", bucket);
}

const dir = resolve(root, "public/uploads");
const files = (await readdir(dir)).filter((f) => !f.startsWith("."));
console.log(`Uploading ${files.length} files…`);

const urlMap = new Map(); // local path -> public URL

for (const file of files) {
  const localPath = `/uploads/${file}`;
  const bytes = await readFile(join(dir, file));
  const contentType =
    file.endsWith(".png")
      ? "image/png"
      : file.endsWith(".webp")
        ? "image/webp"
        : file.endsWith(".jpg") || file.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/octet-stream";

  const { error } = await supabase.storage.from(bucket).upload(file, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error("upload fail", file, error.message);
    continue;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(file);
  urlMap.set(localPath, data.publicUrl);
  console.log("  ok", file);
}

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function rewriteColumn(table, column) {
  const res = await pool.query(
    `SELECT id, "${column}" AS val FROM "${table}" WHERE "${column}" LIKE '/uploads/%'`,
  );
  let n = 0;
  for (const row of res.rows) {
    const next = urlMap.get(row.val);
    if (!next) continue;
    await pool.query(`UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`, [
      next,
      row.id,
    ]);
    n++;
  }
  console.log(`rewrote ${table}.${column}: ${n}`);
}

await rewriteColumn("LibraryAsset", "url");
await rewriteColumn("LibraryAsset", "path");
await rewriteColumn("ImagePackAsset", "url");
await rewriteColumn("ImagePackAsset", "path");

// slidesJson / metaJson may embed /uploads/ paths
const posts = await pool.query(
  `SELECT id, "slidesJson", "metaJson", "coverUrl" FROM "Post"
   WHERE "slidesJson" LIKE '%/uploads/%'
      OR "metaJson" LIKE '%/uploads/%'
      OR "coverUrl" LIKE '/uploads/%'`,
);
let postN = 0;
for (const row of posts.rows) {
  let slidesJson = row.slidesJson || "[]";
  let metaJson = row.metaJson || "{}";
  let coverUrl = row.coverUrl || "";
  let changed = false;
  for (const [from, to] of urlMap) {
    if (slidesJson.includes(from)) {
      slidesJson = slidesJson.split(from).join(to);
      changed = true;
    }
    if (metaJson.includes(from)) {
      metaJson = metaJson.split(from).join(to);
      changed = true;
    }
    if (coverUrl === from) {
      coverUrl = to;
      changed = true;
    }
  }
  if (!changed) continue;
  await pool.query(
    `UPDATE "Post" SET "slidesJson" = $1, "metaJson" = $2, "coverUrl" = $3 WHERE id = $4`,
    [slidesJson, metaJson, coverUrl, row.id],
  );
  postN++;
}
console.log(`rewrote Post media refs: ${postN}`);

await pool.end();
console.log("Done. Images are on Supabase Storage; hard-refresh the library.");
