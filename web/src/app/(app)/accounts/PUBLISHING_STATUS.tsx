"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type Account = {
  id: string;
  username: string;
  oauthConnected?: boolean;
};

export function PublishingStatusCard({ accounts }: { accounts: Account[] }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const connected = accounts.filter((a) => a.oauthConnected).length;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted">
          {connected > 0 ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertCircle className="h-4 w-4 text-warning" />
          )}
          <span>
            {connected > 0
              ? `${connected} account${connected === 1 ? "" : "s"} ready to publish`
              : "Analytics connected — connect TikTok to publish"}
          </span>
        </div>
        <button
          type="button"
          className="text-[11px] text-zinc-500 hover:text-white"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide details" : "Details"}
        </button>
      </div>
      {showAdvanced && (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Publishing uses TikTok OAuth. Analytics sync works from a username
          even without OAuth. Disconnect only revokes publishing access.
        </p>
      )}
    </div>
  );
}
