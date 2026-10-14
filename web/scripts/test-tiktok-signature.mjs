import Signer from "tiktok-signature";

const secUid =
  "MS4wLjABAAAAvUEE9NbhdeIdQeg3vnwTwHB1h6wY9EEbxUlmxAJpbxhkm8dXqgF8mnyslRX1bwaU";
const username = "get_zenoaiapp";

const params = new URLSearchParams({
  aid: "1988",
  count: "30",
  cursor: "0",
  device_platform: "web_pc",
  secUid,
});
const unsigned = `https://www.tiktok.com/api/post/item_list/?${params}`;

const signer = new Signer();
await signer.init();
const sign = await signer.sign(unsigned);
const navigator = await signer.navigator();
await signer.close();

console.log("signed keys", Object.keys(sign));
console.log("navigator", navigator);

const url = sign.signed_url || sign.signedUrl || unsigned;
const headers = {
  "User-Agent": navigator.user_agent || navigator.userAgent,
  Referer: `https://www.tiktok.com/@${username}`,
  Accept: "application/json",
};
if (sign["x-bogus"] || sign.X_Bogus) {
  headers["X-Bogus"] = sign["x-bogus"] || sign.X_Bogus;
}

const res = await fetch(url, { headers });
const text = await res.text();
console.log("status", res.status, "len", text.length);
console.log(text.slice(0, 600));
if (text) {
  const j = JSON.parse(text);
  console.log("itemList", j.itemList?.length, "statusCode", j.statusCode);
}
