import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientJs = resolve(root, "node_modules/.prisma/client/index.js");
const engineWin = resolve(
  root,
  "node_modules/.prisma/client/query_engine-windows.dll.node",
);

const result = spawnSync("npx", ["prisma", "generate"], {
  cwd: root,
  shell: true,
  encoding: "utf8",
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) process.exit(0);

const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
const locked =
  /EPERM|operation not permitted|EBUSY|resource busy or locked/i.test(combined);
const reusable = existsSync(clientJs) && existsSync(engineWin);

if (locked && reusable) {
  console.warn(
    "[prisma-generate] Query engine is locked (usually npm run dev). Reusing the existing Prisma client.",
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
