const username = "get_zenoaiapp";
const secUid =
  "MS4wLjABAAAAvUEE9NbhdeIdQeg3vnwTwHB1h6wY9EEbxUlmxAJpbxhkm8dXqgF8mnyslRX1bwaU";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function main() {
  // Warm session on profile page
  const profileRes = await fetch(`https://www.tiktok.com/@${username}`, {
    headers: {
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  const setCookie = profileRes.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  console.log("profile status", profileRes.status, "cookies", setCookie.length);

  const params = new URLSearchParams({
    aid: "1988",
    app_language: "en",
    app_name: "tiktok_web",
    browser_language: "en-US",
    browser_name: "Mozilla",
    browser_online: "true",
    browser_platform: "Win32",
    browser_version: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    channel: "tiktok_web",
    cookie_enabled: "true",
    count: "30",
    cursor: "0",
    device_platform: "web_pc",
    focus_state: "true",
    from_page: "user",
    history_len: "3",
    is_fullscreen: "false",
    is_page_visible: "true",
    language: "en",
    os: "windows",
    priority_region: "",
    referer: "",
    region: "US",
    screen_height: "1080",
    screen_width: "1920",
    secUid,
    tz_name: "America/New_York",
    webcast_language: "en",
  });

  const url = `https://www.tiktok.com/api/post/item_list/?${params}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: `https://www.tiktok.com/@${username}`,
      Cookie: cookie,
    },
  });
  const text = await res.text();
  console.log("item_list status", res.status, "len", text.length);
  console.log("preview", text.slice(0, 500));
  if (text) {
    try {
      const j = JSON.parse(text);
      console.log("keys", Object.keys(j));
      console.log("itemList len", j.itemList?.length);
      console.log("statusCode", j.statusCode, j.status_code);
      if (j.itemList?.[0]) {
        console.log("first id", j.itemList[0].id);
        console.log("first stats", j.itemList[0].stats);
      }
    } catch (e) {
      console.log("parse error", e.message);
    }
  }
}

main().catch(console.error);
