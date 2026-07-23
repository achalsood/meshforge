"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { RepositoryIssue, RepositorySnapshot } from "@/lib/repository/types";
import type { IssueFilter } from "@/components/workspace/issues-drawer";

export function useRepositoryIssues(
  repository: RepositorySnapshot | null,
  active: boolean,
  onFlash: (message: string) => void,
) {
  const [issues, setIssues] = useState<RepositoryIssue[]>([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [issueLabels, setIssueLabels] = useState("enhancement");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("open");
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const [issueComment, setIssueComment] = useState("");
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issueMutation, setIssueMutation] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [loadedRepositoryKey, setLoadedRepositoryKey] = useState("");
  const repositoryKey = repository ? `${repository.owner}/${repository.name}` : "";
  const currentIssues = useMemo(
    () => loadedRepositoryKey === repositoryKey ? issues : [],
    [issues, loadedRepositoryKey, repositoryKey],
  );

  const filteredIssues = useMemo(
    () => currentIssues.filter((issue) => issueFilter === "all" || issue.status === issueFilter),
    [currentIssues, issueFilter],
  );
  const selectedIssue = currentIssues.find((issue) => issue.number === selectedIssueNumber) ?? filteredIssues[0] ?? null;
  const openIssues = currentIssues.filter((issue) => issue.status === "open").length;

  async function loadIssues() {
    if (!repository || issuesLoading) return;
    setIssuesLoading(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues`, { cache: "no-store" });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issues could not be loaded");
      setIssues(result);
      setLoadedRepositoryKey(repositoryKey);
      setSelectedIssueNumber((current) => result.some((issue) => issue.number === current) ? current : result[0]?.number ?? null);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issues could not be loaded");
    } finally {
      setIssuesLoading(false);
    }
  }

  useEffect(() => {
    if (!active || !repository) return;
    let cancelled = false;
    const load = async () => {
      setIssuesLoading(true);
      setIssueError("");
      try {
        const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues`, { cache: "no-store" });
        const result = await response.json() as RepositoryIssue[] | { error: string };
        if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issues could not be loaded");
        if (!cancelled) {
          setIssues(result);
          setLoadedRepositoryKey(repositoryKey);
          setSelectedIssueNumber((current) => result.some((issue) => issue.number === current) ? current : result[0]?.number ?? null);
        }
      } catch (cause) {
        if (!cancelled) setIssueError(cause instanceof Error ? cause.message : "Issues could not be loaded");
      } finally {
        if (!cancelled) setIssuesLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [active, repository, repositoryKey]);

  async function createIssue(event: FormEvent) {
    event.preventDefault();
    if (!repository || !issueTitle.trim() || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: issueLabels.split(",").map((label) => label.trim()).filter(Boolean),
        }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issue could not be created");
      setIssues(result);
      setLoadedRepositoryKey(repositoryKey);
      setIssueTitle("");
      setIssueBody("");
      setIssueLabels("enhancement");
      setIssueFilter("open");
      setSelectedIssueNumber(result[0]?.number ?? null);
      onFlash(`Opened issue #${result[0]?.number ?? ""}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issue could not be created");
    } finally {
      setIssueMutation(false);
    }
  }

  async function changeIssueStatus(issue: RepositoryIssue) {
    if (!repository || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues/${issue.number}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: issue.status === "open" ? "closed" : "open" }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Issue could not be updated");
      setIssues(result);
      setLoadedRepositoryKey(repositoryKey);
      onFlash(`${issue.status === "open" ? "Closed" : "Reopened"} issue #${issue.number}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Issue could not be updated");
    } finally {
      setIssueMutation(false);
    }
  }

  async function addIssueComment(event: FormEvent) {
    event.preventDefault();
    if (!repository || !selectedIssue || !issueComment.trim() || issueMutation) return;
    setIssueMutation(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/issues/${selectedIssue.number}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: issueComment }),
      });
      const result = await response.json() as RepositoryIssue[] | { error: string };
      if (!response.ok || !Array.isArray(result)) throw new Error("error" in result ? result.error : "Comment could not be added");
      setIssues(result);
      setLoadedRepositoryKey(repositoryKey);
      setIssueComment("");
      onFlash(`Commented on issue #${selectedIssue.number}`);
    } catch (cause) {
      setIssueError(cause instanceof Error ? cause.message : "Comment could not be added");
    } finally {
      setIssueMutation(false);
    }
  }

  return {
    addIssueComment,
    changeIssueStatus,
    createIssue,
    filteredIssues,
    issueBody,
    issueComment,
    issueError,
    issueFilter,
    issueLabels,
    issueMutation,
    issues: currentIssues,
    issuesLoading,
    issueTitle,
    loadIssues,
    openIssues,
    selectedIssue,
    setIssueBody,
    setIssueComment,
    setIssueFilter,
    setIssueLabels,
    setIssueTitle,
    setSelectedIssueNumber,
  };
}
