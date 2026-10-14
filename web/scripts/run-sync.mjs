/**
 * One-off: sync all TikTok accounts via the local API.
 * Usage: node scripts/run-sync.mjs
 */
const base = process.env.BASE_URL || "http://localhost:3000";

const projects = await fetch(`${base}/api/projects`).then((r) => r.json());
const list = projects.data?.projects || projects.projects || [];
console.log(
  "projects",
  list.map((p) => p.name),
);

for (const project of list) {
  const accRes = await fetch(`${base}/api/accounts?projectId=${project.id}`).then(
    (r) => r.json(),
  );
  const accounts = accRes.data?.accounts || accRes.accounts || [];
  for (const acc of accounts) {
    if (acc.platform !== "tiktok") continue;
    console.log(`\nSyncing @${acc.username} …`);
    const started = Date.now();
    const res = await fetch(`${base}/api/accounts/${acc.id}/sync`, {
      method: "POST",
    });
    const body = await res.json();
    const data = body.data || body;
    console.log({
      http: res.status,
      success: data.success,
      followers: data.followers,
      videosSynced: data.videosSynced,
      ms: Date.now() - started,
      lastSteps: (data.steps || [])
        .slice(-6)
        .map((s) => `${s.status}:${s.step} — ${s.message}`),
    });
  }
}
