"use client";

import { PageHeader } from "@/components/page-header";
import { CalendarView } from "@/components/calendar-view";
import { LoadingBlock } from "@/components/empty-state";
import { useProject } from "@/lib/project-context";

export default function CalendarPage() {
  const { project, projectId, loading } = useProject();

  if (loading || !project || !projectId) return <LoadingBlock />;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Calendar"
        description={`${project.name} · drag drafts onto the weekly grid to schedule`}
      />
      <div className="min-h-0 flex-1 px-8 py-6">
        <CalendarView projectId={projectId} />
      </div>
    </div>
  );
}
