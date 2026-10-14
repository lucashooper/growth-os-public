import fs from "fs";

const path = process.env.TEMP + "/tiktok-universal.json";
const j = JSON.parse(fs.readFileSync(path, "utf8"));

function walk(o, p, d) {
  if (!o || typeof o !== "object" || d > 7) return;
  if (Array.isArray(o)) {
    if (o.length && /item|video|post/i.test(p)) {
      console.log(
        p,
        "array len",
        o.length,
        "first keys",
        o[0] && typeof o[0] === "object" ? Object.keys(o[0]).slice(0, 25) : typeof o[0],
      );
    }
    o.slice(0, 1).forEach((x, i) => walk(x, `${p}[${i}]`, d + 1));
    return;
  }
  for (const [k, v] of Object.entries(o)) {
    const np = p ? `${p}.${k}` : k;
    if (
      [
        "userInfo",
        "user",
        "stats",
        "statsV2",
        "itemList",
        "itemModule",
        "ItemModule",
        "videoList",
        "posts",
      ].includes(k) ||
      /itemList|video|userInfo|Author/i.test(k)
    ) {
      console.log(
        np,
        Array.isArray(v) ? `array${v.length}` : typeof v,
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.keys(v).slice(0, 20)
          : "",
      );
    }
    walk(v, np, d + 1);
  }
}

walk(j, "", 0);

const s = JSON.stringify(j);
for (const k of [
  "followerCount",
  "videoCount",
  "playCount",
  "diggCount",
  "avatarLarger",
  "secUid",
  "uniqueId",
  "itemList",
  "id",
  "aweme_id",
  "desc",
]) {
  console.log(k, "count", (s.match(new RegExp(`"${k}"`, "g")) || []).length);
}

// Dump userInfo path if present
const def = j?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
if (def) {
  console.log("\nwebapp.user-detail keys:", Object.keys(def));
  const ui = def.userInfo;
  if (ui) {
    console.log("userInfo.user keys:", Object.keys(ui.user || {}));
    console.log("userInfo.stats:", ui.stats);
    console.log("nickname:", ui.user?.nickname);
    console.log("avatar:", (ui.user?.avatarLarger || "").slice(0, 80));
    console.log("secUid:", ui.user?.secUid);
  }
  if (def.itemList) {
    console.log("itemList length:", def.itemList.length);
    console.log("item0 keys:", Object.keys(def.itemList[0] || {}));
    console.log("item0.stats:", def.itemList[0]?.stats);
  }
}
