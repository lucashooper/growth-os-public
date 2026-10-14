import { Suspense } from "react";
import InsightsPage from "./insights-client";
import { LoadingBlock } from "@/components/empty-state";

export default function InsightsRoute() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading insights…" />}>
      <InsightsPage />
    </Suspense>
  );
}
