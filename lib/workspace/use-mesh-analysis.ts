"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisFinding, RepositoryAnalysis } from "@/lib/intelligence/repository-analyzer";
import type { RepositorySnapshot } from "@/lib/repository/types";

interface WorkingFile {
  path: string;
  content: string;
}

interface MeshAnalysisOptions {
  repository: RepositorySnapshot | null;
  files: WorkingFile[];
  activeFile: string;
  editActiveFile: (content: string) => void;
  openFile: (path: string) => void;
  updateFile: (path: string, content: string) => void;
  onBeforeOpen: () => void;
  onFlash: (message: string) => void;
}

export type AnalysisTab = "findings" | "hotspots" | "graph" | "algorithms";

export function useMeshAnalysis(options: MeshAnalysisOptions) {
  const {
    repository, files, activeFile, editActiveFile, openFile, updateFile,
    onBeforeOpen, onFlash,
  } = options;
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<AnalysisTab>("findings");
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const selectedFinding = useMemo(
    () => analysis?.findings.find((finding) => finding.id === selectedFindingId) ?? analysis?.findings[0],
    [analysis, selectedFindingId],
  );

  const run = useCallback(async () => {
    if (!repository || analyzing) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const result = await response.json() as RepositoryAnalysis | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "Analysis failed");
      }
      setAnalysis(result);
      setSelectedFindingId(result.findings[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, files, repository]);

  const show = useCallback(async () => {
    onBeforeOpen();
    setOpen(true);
    if (!analysis && repository) await run();
  }, [analysis, onBeforeOpen, repository, run]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void show();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [show]);

  function applySuggestion(finding: AnalysisFinding) {
    if (!finding.patch) return;
    const file = files.find((candidate) => candidate.path === finding.patch?.path);
    if (!file || !file.content.includes(finding.patch.before)) {
      setError("The file changed after analysis. Run the review again before applying this patch.");
      return;
    }
    const next = file.content.replace(finding.patch.before, finding.patch.after);
    if (file.path === activeFile) editActiveFile(next);
    else {
      updateFile(file.path, next);
      openFile(file.path);
    }
    setAnalysis(null);
    setSelectedFindingId("");
    setOpen(false);
    onFlash(`Applied Mesh AI patch to ${file.path}`);
  }

  return {
    analysis,
    analyzing,
    applySuggestion,
    close: () => setOpen(false),
    error,
    open,
    openFile,
    run,
    selectedFinding,
    selectFinding: setSelectedFindingId,
    setTab,
    show,
    tab,
    toggle: () => open ? setOpen(false) : void show(),
  };
}
