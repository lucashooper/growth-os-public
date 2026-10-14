"use client";

import { Suspense } from "react";
import { ProjectProvider } from "@/lib/project-context";
import { WelcomeOverlay } from "@/components/welcome-overlay";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      {children}
      <Suspense fallback={null}>
        <WelcomeOverlay />
      </Suspense>
    </ProjectProvider>
  );
}
