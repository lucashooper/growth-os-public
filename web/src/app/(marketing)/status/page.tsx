import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status · Growth OS",
};

const systems = [
  { name: "App & API", status: "Operational" },
  { name: "Authentication (Supabase)", status: "Operational" },
  { name: "AI generation", status: "Operational" },
  { name: "TikTok sync", status: "Operational" },
  { name: "TikTok publishing", status: "Operational" },
];

export default function StatusPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">System status</h1>
      <p className="mt-2 text-sm text-muted">
        Placeholder status board. All systems listed as operational unless an incident is posted.
      </p>
      <ul className="mt-8 space-y-2">
        {systems.map((s) => (
          <li
            key={s.name}
            className="flex items-center justify-between rounded-xl border border-border bg-surface/30 px-4 py-3 text-sm"
          >
            <span className="text-ink">{s.name}</span>
            <span className="text-xs font-medium text-emerald-400">{s.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted">
        Updated {new Date().toISOString().slice(0, 10)} · Incidents: none
      </p>
    </div>
  );
}
