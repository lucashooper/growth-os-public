/**
 * One-shot helper: wrap API route handlers with withApi for request logging.
 * Idempotent — skips files that already import withApi.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, relative } from "path";

const apiRoot = join(process.cwd(), "src/app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

function wrapFile(file) {
  let src = readFileSync(file, "utf8");
  if (src.includes("withApi")) {
    console.log("skip", relative(process.cwd(), file));
    return false;
  }

  // Skip if no exported handlers
  if (!METHODS.some((m) => src.includes(`export async function ${m}`))) {
    console.log("no-handlers", relative(process.cwd(), file));
    return false;
  }

  if (!src.includes('from "@/lib/api-route"')) {
    const importLine = 'import { withApi } from "@/lib/api-route";\n';
    const lastImport = [...src.matchAll(/^import .+;$/gm)].pop();
    if (lastImport) {
      const idx = lastImport.index + lastImport[0].length;
      src = src.slice(0, idx) + "\n" + importLine + src.slice(idx);
    } else {
      src = importLine + src;
    }
  }

  for (const m of METHODS) {
    const re = new RegExp(`export async function ${m}\\b`);
    if (re.test(src)) {
      src = src.replace(re, `async function handle${m}`);
      src += `\nexport const ${m} = withApi(handle${m}, "${m} ${relative(process.cwd(), file).replace(/\\/g, "/")}");\n`;
    }
  }

  writeFileSync(file, src);
  console.log("wrap", relative(process.cwd(), file));
  return true;
}

const files = walk(apiRoot);
let n = 0;
for (const f of files) {
  if (wrapFile(f)) n++;
}
console.log(`Wrapped ${n}/${files.length} routes`);
