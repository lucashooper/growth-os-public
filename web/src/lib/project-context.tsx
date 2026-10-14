"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "@/lib/api-client";
import { warmWorkspaceCache } from "@/lib/workspace-cache";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  _count?: { accounts: number; posts: number; experiments: number };
};

type ProjectContextValue = {
  project: Project | null;
  projectId: string | null;
  projects: Project[];
  loading: boolean;
  error: string | null;
  setProjectId: (id: string) => void;
  refresh: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);
const STORAGE_KEY = "workspace.activeProject";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ projects: Project[] }>("/api/projects", {
      retries: 1,
    });
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setProjects(res.data.projects);
    setError(null);

    const saved =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const nextId =
      (saved && res.data.projects.some((p) => p.id === saved) && saved) ||
      res.data.projects[0]?.id ||
      null;
    setProjectIdState(nextId);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projectId) return;
    void warmWorkspaceCache(projectId).catch(() => {});
  }, [projectId]);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const value = useMemo(
    () => ({
      project,
      projectId,
      projects,
      loading,
      error,
      setProjectId,
      refresh,
    }),
    [project, projectId, projects, loading, error, setProjectId, refresh],
  );

  return (
    <ProjectContext.Provider value={value}>
      {error && !loading ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
          <p className="text-sm font-medium text-ink">Workspace failed to load</p>
          <p className="max-w-md text-sm text-muted">{error}</p>
          <p className="max-w-md text-xs text-muted">
            Usually the production database URL is wrong or tables are missing.
            Check /api/health (database.connected).
          </p>
          <button
            type="button"
            className="mt-2 rounded-full bg-white px-4 py-2 text-xs font-medium text-black"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : (
        children
      )}
    </ProjectContext.Provider>
  );
}

const EMPTY: ProjectContextValue = {
  project: null,
  projectId: null,
  projects: [],
  loading: true,
  error: null,
  setProjectId: () => undefined,
  refresh: async () => undefined,
};

export function useProject() {
  return useContext(ProjectContext) ?? EMPTY;
}
