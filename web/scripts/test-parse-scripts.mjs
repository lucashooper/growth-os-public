import { readFileSync } from "fs";
import { createRequire } from "module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Simple duplicate of critical assertions via dynamic import through ts-node alternative:
// Re-implement strip+parse inline matching parse-scripts.ts for smoke test.

const CHROME_LINE =
  /^(paste your scripts|numbered posts|change path|we keep your words|image pack|build slideshows)\b/i;

function stripChrome(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !CHROME_LINE.test(line.trim()))
    .join("\n")
    .trim();
}

function cleanTitle(raw) {
  return raw
    .replace(/^\s*\d+[\.\)]\s*/, "")
    .replace(/^[“"']+/, "")
    .replace(/[”"']+$/, "")
    .trim();
}

function parseSlideChunk(chunk) {
  const header = chunk.match(
    /^\s*Slide\s+(\d+)\s*(?:\(([^)]*)\))?\s*(?:\n|$)/i,
  );
  if (!header) return null;
  const index = Number(header[1]);
  const beat = (header[2] || "").trim();
  const slideBody = chunk.slice(header[0].length).trim();
  const slideText = slideBody
    .split(/\n/)
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const isProduct = /product/i.test(beat);
  if (!slideText && !isProduct) return null;
  return {
    index: Number.isFinite(index) ? index : 0,
    text: slideText,
    beat: beat.toLowerCase() || (isProduct ? "product" : "beat"),
    isProduct,
  };
}

function parseScriptBatch(raw) {
  const text = stripChrome(raw);
  if (!text) return [];
  const parts = text.split(/(?=^\s*\d+[\.\)]\s+\S)/m).filter((p) => p.trim());
  const carousels = [];
  for (const part of parts) {
    const lines = part.split("\n");
    const titleLine = lines[0] || "";
    if (!/^\s*\d+[\.\)]\s+\S/.test(titleLine)) continue;
    const title = cleanTitle(titleLine);
    if (!title) continue;
    const body = lines.slice(1).join("\n");
    const slideChunks = body
      .split(/(?=^\s*Slide\s+\d+)/im)
      .filter((c) => c.trim());
    const slides = [];
    for (const chunk of slideChunks) {
      const slide = parseSlideChunk(chunk);
      if (slide) slides.push(slide);
    }
    slides.sort((a, b) => a.index - b.index);
    if (slides.length) carousels.push({ title, slides });
  }
  return carousels;
}

const raw = readFileSync(new URL("./sample-scripts.txt", import.meta.url), "utf8");
const parsed = parseScriptBatch(`Paste your scripts\nNumbered posts\nChange path\n${raw}`);
console.log("carousels", parsed.length);
console.log("counts", parsed.map((c) => c.slides.length).join(","));
console.log("first", parsed[0]?.slides[0]?.text);
console.log("product", parsed[0]?.slides[4]?.isProduct, parsed[0]?.slides[4]?.text);
if (parsed.length !== 5) process.exit(1);
if (parsed.some((c) => c.slides.length !== 5)) process.exit(1);
console.log("OK");
