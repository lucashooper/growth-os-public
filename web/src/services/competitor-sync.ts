import "server-only";

import { ingestCompetitor, type IngestResult } from "@/services/intel/ingest";

export type CompetitorSyncResult = {
  success: boolean;
  videosSynced: number;
  followers: number | null;
  error?: string;
  providers?: IngestResult["providers"];
};

/** @deprecated Prefer ingestCompetitor — kept for API compatibility */
export async function syncCompetitor(
  competitorId: string,
): Promise<CompetitorSyncResult> {
  const result = await ingestCompetitor(competitorId);
  return {
    success: result.success,
    videosSynced: result.videosSynced,
    followers: result.followers,
    error: result.error,
    providers: result.providers,
  };
}

export { ingestCompetitor };
