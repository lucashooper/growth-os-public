import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(root, "prisma/schema.prisma");
const url = process.env.DATABASE_URL || "";
const restore = process.argv.includes("--restore");
// Keep postgres schema on Netlify/CI so deploy artifact matches the generated client
if (restore && (process.env.NETLIFY === "true" || process.env.CI === "true")) {
  console.log("[prepare-prisma] skip --restore on CI (keep postgresql)");
  process.exit(0);
}
const wantPostgres = !restore && /^postgres(ql)?:\/\//i.test(url);
const provider = wantPostgres ? "postgresql" : "sqlite";
let schema = readFileSync(schemaPath, "utf8");
schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql)"/,
  `provider = "${provider}"`,
);
writeFileSync(schemaPath, schema);
console.log(`[prepare-prisma] provider=${provider}`);
