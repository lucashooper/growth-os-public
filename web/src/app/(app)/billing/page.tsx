import { Suspense } from "react";
import { BillingView } from "@/components/billing-view";
import { LoadingBlock } from "@/components/empty-state";

export default function BillingPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading billing…" />}>
      <BillingView />
    </Suspense>
  );
}
