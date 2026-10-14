import { chromium } from "playwright";

const username = process.argv[2] || "get_zenoaiapp";

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  locale: "en-US",
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

const videos = new Map();
const itemListPayloads = [];

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/api/post/item_list/")) return;
  try {
    const json = await response.json();
    itemListPayloads.push({
      status: response.status(),
      count: json.itemList?.length ?? 0,
      statusCode: json.statusCode,
    });
    for (const item of json.itemList || []) {
      if (item?.id) videos.set(String(item.id), item);
    }
  } catch {
    /* ignore */
  }
});

console.log("Opening", `https://www.tiktok.com/@${username}`);
await page.goto(`https://www.tiktok.com/@${username}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForTimeout(4000);

// Scroll to trigger item_list
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(1500);
}

console.log("item_list responses", itemListPayloads);
console.log("videos captured", videos.size);
const sample = [...videos.values()].slice(0, 3).map((v) => ({
  id: v.id,
  desc: (v.desc || "").slice(0, 60),
  stats: v.stats,
}));
console.log(JSON.stringify(sample, null, 2));

// Also try reading UNIVERSAL data from page
const profile = await page.evaluate(() => {
  const el = document.querySelector("#__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (!el?.textContent) return null;
  try {
    const j = JSON.parse(el.textContent);
    const ui = j?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
    if (!ui) return null;
    return {
      nickname: ui.user?.nickname,
      followers: ui.stats?.followerCount,
      videoCount: ui.stats?.videoCount,
      hearts: ui.stats?.heart,
      avatar: ui.user?.avatarLarger,
      itemListLen: ui.itemList?.length ?? 0,
    };
  } catch {
    return null;
  }
});
console.log("profile from DOM", profile);

await browser.close();
