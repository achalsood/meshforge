"use client";

import { useEffect, useState } from "react";
import type { SessionPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";

export type AuthState = "loading" | "ready" | "required" | "error";

export function useWorkspaceSession(initialFile: string) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [authError, setAuthError] = useState("");
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null);
  const [activeFile, setActiveFile] = useState(initialFile);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) setAuthState("required");
          return null;
        }
        if (!response.ok) throw new Error("Your MeshForge workspace could not be loaded");
        return response.json() as Promise<SessionPayload>;
      })
      .then(async (nextSession) => {
        if (cancelled || !nextSession) return;
        setSession(nextSession);
        setAuthState("ready");
        const first = nextSession.repositories[0];
        if (!first) return;
        const response = await fetch(`/api/repos/${first.owner}/${first.name}`, { cache: "no-store" });
        const result = await response.json() as RepositorySnapshot | { error: string };
        if (!response.ok || "error" in result) {
          throw new Error("error" in result ? result.error : "Repository could not be loaded");
        }
        if (cancelled) return;
        setRepository(result);
        setActiveFile((current) => result.files.some((file) => file.path === current) ? current : result.files[0]?.path ?? current);
      })
      .catch((cause) => {
        if (cancelled) return;
        setAuthState("error");
        setAuthError(cause instanceof Error ? cause.message : "Your MeshForge workspace could not be loaded");
      });
    return () => { cancelled = true; };
  }, []);

  return {
    activeFile,
    authError,
    authState,
    repository,
    session,
    setActiveFile,
    setRepository,
    setSession,
  };
}
