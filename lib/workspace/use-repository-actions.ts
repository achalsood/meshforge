"use client";

import { useEffect, useState } from "react";
import type { RepositorySnapshot, WorkflowRun } from "@/lib/repository/types";

export function useRepositoryActions(
  repository: RepositorySnapshot | null,
  active: boolean,
  onFlash: (message: string) => void,
) {
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [actionsError, setActionsError] = useState("");
  const [loadedRepositoryKey, setLoadedRepositoryKey] = useState("");
  const repositoryKey = repository ? `${repository.owner}/${repository.name}` : "";
  const currentRuns = loadedRepositoryKey === repositoryKey ? workflowRuns : [];

  async function loadActions() {
    if (!repository || actionsLoading) return;
    setActionsLoading(true);
    setActionsError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/actions`, { cache: "no-store" });
      const result = await response.json() as WorkflowRun[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow runs could not be loaded");
      setWorkflowRuns(result);
      setLoadedRepositoryKey(repositoryKey);
    } catch (cause) {
      setActionsError(cause instanceof Error ? cause.message : "Workflow runs could not be loaded");
    } finally {
      setActionsLoading(false);
    }
  }

  useEffect(() => {
    if (!active || !repository) return;
    let cancelled = false;
    const load = async () => {
      setActionsLoading(true);
      setActionsError("");
      try {
        const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/actions`, { cache: "no-store" });
        const result = await response.json() as WorkflowRun[] | { error: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow runs could not be loaded");
        if (!cancelled) {
          setWorkflowRuns(result);
          setLoadedRepositoryKey(repositoryKey);
        }
      } catch (cause) {
        if (!cancelled) setActionsError(cause instanceof Error ? cause.message : "Workflow runs could not be loaded");
      } finally {
        if (!cancelled) setActionsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [active, repository, repositoryKey]);

  async function runWorkflow() {
    if (!repository || runningWorkflow) return;
    setRunningWorkflow(true);
    setActionsError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: repository.branch }),
      });
      const result = await response.json() as WorkflowRun[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Workflow could not be started");
      setWorkflowRuns(result);
      setLoadedRepositoryKey(repositoryKey);
      onFlash(`Mesh CI ${result[0]?.status === "success" ? "passed" : "found an issue"}`);
    } catch (cause) {
      setActionsError(cause instanceof Error ? cause.message : "Workflow could not be started");
    } finally {
      setRunningWorkflow(false);
    }
  }

  return {
    actionsError,
    actionsLoading,
    loadActions,
    runWorkflow,
    runningWorkflow,
    workflowRuns: currentRuns,
  };
}
