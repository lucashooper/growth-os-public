"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { KeyboardNav } from "@/components/keyboard-nav";
import { AppPrefetcher } from "@/components/app-prefetcher";
import { SubscriptionGate } from "@/components/subscription-gate";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullHeight =
    pathname === "/generate" || pathname === "/chat" || pathname === "/calendar";

  return (
    <>
      <KeyboardNav />
      <AppPrefetcher />
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar className="hidden md:flex" />
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col bg-bg",
            fullHeight ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          <SubscriptionGate>{children}</SubscriptionGate>
        </main>
      </div>
    </>
  );
}
