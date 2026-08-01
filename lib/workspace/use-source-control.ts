"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { SessionPayload } from "@/lib/auth/types";
import type { RepositorySnapshot } from "@/lib/repository/types";

interface SourceControlOptions {
  setSession: (session: SessionPayload) => void;
  repository: RepositorySnapshot | null;
  setRepository: (repository: RepositorySnapshot) => void;
  activeFile: string;
  setActiveFile: (updater: string | ((current: string) => string)) => void;
  workingFiles: Record<string, string>;
  setWorkingFiles: (updater: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  currentText: string;
  onNavigateCode: () => void;
  onFlash: (message: string) => void;
}

export function useSourceControl(options: SourceControlOptions) {
  const {
    setSession, repository, setRepository, activeFile, setActiveFile,
    workingFiles, setWorkingFiles, currentText, onNavigateCode, onFlash,
  } = options;
  const [repositoryMenuOpen, setRepositoryMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [creatingRepository, setCreatingRepository] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [pullTitle, setPullTitle] = useState("");
  const [pullBody, setPullBody] = useState("");
  const [pullHeadBranch, setPullHeadBranch] = useState("");
  const [creatingPull, setCreatingPull] = useState(false);
  const [mergingNumber, setMergingNumber] = useState<number | null>(null);
  const [error, setError] = useState("");

  const workingSnapshot = useMemo(() => repository?.files.map((file) => ({
    path: file.path,
    content: file.path === activeFile ? currentText : workingFiles[file.path] ?? file.content,
  })) ?? [], [activeFile, currentText, repository, workingFiles]);

  const dirtyPaths = useMemo(() => new Set(workingSnapshot
    .filter((file) => file.content !== repository?.files.find((stored) => stored.path === file.path)?.content)
    .map((file) => file.path)), [repository, workingSnapshot]);

  const defaultPullHeadBranch = pullHeadBranch || repository?.branches.find((branch) => !branch.isDefault)?.name || "";

  function applyRepository(snapshot: RepositorySnapshot) {
    setRepository(snapshot);
    setWorkingFiles({});
    setError("");
    setActiveFile((current) => snapshot.files.some((file) => file.path === current) ? current : snapshot.files[0]?.path ?? current);
  }

  function openFile(path: string) {
    if (path === activeFile) return;
    setWorkingFiles((current) => ({ ...current, [activeFile]: currentText }));
    setActiveFile(path);
  }

  async function createCommit(event: FormEvent) {
    event.preventDefault();
    if (!repository || !dirtyPaths.size || committing) return;
    setCommitting(true);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: repository.branch,
          expectedHeadOid: repository.headOid,
          message: commitMessage || `Update ${activeFile}`,
          files: workingSnapshot,
        }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Commit failed");
      setRepository(result);
      setWorkingFiles({});
      setCommitMessage("");
      setHistoryOpen(true);
      onFlash(`Committed ${result.headOid.slice(0, 8)} to ${result.branch}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function selectRepository(owner: string, name: string) {
    if (dirtyPaths.size) {
      onFlash("Commit your working changes before switching repositories");
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/repos/${owner}/${name}`, { cache: "no-store" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Repository could not be loaded");
      }
      applyRepository(result);
      setRepositoryMenuOpen(false);
      setBranchMenuOpen(false);
      onNavigateCode();
      onFlash(`Opened ${owner}/${name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository could not be loaded");
    }
  }

  async function createRepository(event: FormEvent) {
    event.preventDefault();
    if (!newRepositoryName.trim() || creatingRepository) return;
    setCreatingRepository(true);
    setError("");
    try {
      const response = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRepositoryName }),
      });
      const result = await response.json() as { session: SessionPayload; repository: RepositorySnapshot } | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Repository could not be created");
      }
      setSession(result.session);
      applyRepository(result.repository);
      setNewRepositoryName("");
      setRepositoryMenuOpen(false);
      onFlash(`Created ${result.repository.owner}/${result.repository.name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Repository could not be created");
    } finally {
      setCreatingRepository(false);
    }
  }

  async function switchBranch(branch: string) {
    if (!repository || branch === repository.branch) {
      setBranchMenuOpen(false);
      return;
    }
    if (dirtyPaths.size) {
      onFlash("Commit your working changes before switching branches");
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}?branch=${encodeURIComponent(branch)}`, { cache: "no-store" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Branch could not be loaded");
      }
      applyRepository(result);
      setBranchMenuOpen(false);
      setHistoryOpen(false);
      onNavigateCode();
      onFlash(`Switched to ${branch}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Branch could not be loaded");
    }
  }

  async function createBranch(event: FormEvent) {
    event.preventDefault();
    if (!repository || !newBranchName.trim() || creatingBranch) return;
    if (dirtyPaths.size) {
      onFlash("Commit your working changes before creating a branch");
      return;
    }
    setCreatingBranch(true);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBranchName, fromBranch: repository.branch, expectedHeadOid: repository.headOid }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Branch could not be created");
      }
      applyRepository(result);
      setNewBranchName("");
      setBranchMenuOpen(false);
      setHistoryOpen(false);
      onFlash(`Created and switched to ${result.branch}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Branch could not be created");
    } finally {
      setCreatingBranch(false);
    }
  }

  async function createPullRequest(event: FormEvent) {
    event.preventDefault();
    if (!repository || !defaultPullHeadBranch || creatingPull) return;
    setCreatingPull(true);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/pulls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pullTitle,
          body: pullBody,
          headBranch: defaultPullHeadBranch,
          baseBranch: repository.defaultBranch,
        }),
      });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Pull request could not be created");
      }
      applyRepository(result);
      setPullTitle("");
      setPullBody("");
      setPullHeadBranch("");
      onFlash(`Opened pull request #${result.pullRequests[0]?.number ?? ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pull request could not be created");
    } finally {
      setCreatingPull(false);
    }
  }

  async function mergePullRequest(number: number) {
    if (!repository || mergingNumber !== null) return;
    setMergingNumber(number);
    setError("");
    try {
      const response = await fetch(`/api/repos/${repository.owner}/${repository.name}/pulls/${number}/merge`, { method: "POST" });
      const result = await response.json() as RepositorySnapshot | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Pull request could not be merged");
      }
      applyRepository(result);
      onFlash(`Merged pull request #${number} into ${result.branch}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pull request could not be merged");
    } finally {
      setMergingNumber(null);
    }
  }

  return {
    applyRepository,
    branchMenuOpen,
    closeBranchMenu: () => setBranchMenuOpen(false),
    closeHistory: () => setHistoryOpen(false),
    closeRepositoryMenu: () => setRepositoryMenuOpen(false),
    commitMessage,
    committing,
    createBranch,
    createCommit,
    createPullRequest,
    createRepository,
    creatingBranch,
    creatingPull,
    creatingRepository,
    dirtyPaths,
    error,
    headBranch: defaultPullHeadBranch,
    historyOpen,
    mergePullRequest,
    mergingNumber,
    newBranchName,
    newRepositoryName,
    openFile,
    pullBody,
    pullTitle,
    repositoryMenuOpen,
    selectRepository,
    setCommitMessage,
    setError,
    setNewBranchName,
    setNewRepositoryName,
    setPullBody,
    setPullHeadBranch,
    setPullTitle,
    switchBranch,
    toggleBranchMenu: () => setBranchMenuOpen((open) => !open),
    toggleHistory: () => setHistoryOpen((open) => !open),
    toggleRepositoryMenu: () => setRepositoryMenuOpen((open) => !open),
    workingSnapshot,
  };
}
