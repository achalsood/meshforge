import { analyzeRepository } from "../intelligence/repository-analyzer.ts";

export type WorkflowStepStatus = "success" | "failure";

export interface WorkflowEvaluationStep {
  name: string;
  status: WorkflowStepStatus;
  durationMs: number;
  logs: string[];
}

export interface WorkflowEvaluation {
  status: WorkflowStepStatus;
  durationMs: number;
  steps: WorkflowEvaluationStep[];
}

export function evaluateRepositoryWorkflow(files: Array<{ path: string; content: string }>): WorkflowEvaluation {
  const analysis = analyzeRepository(files);
  const testFiles = files.filter((file) => /(^|\/)(tests?|__tests__)\//i.test(file.path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file.path));
  const syntaxPassed = analysis.summary.syntaxErrors === 0;
  const criticalFindings = analysis.findings.filter((finding) => finding.severity === "critical").length;
  const steps: WorkflowEvaluationStep[] = [
    {
      name: "Checkout snapshot",
      status: "success",
      durationMs: 18 + files.length,
      logs: [
        `Resolved ${files.length} files from the content-addressed commit tree.`,
        `Indexed ${analysis.summary.lines.toLocaleString()} source lines.`,
      ],
    },
    {
      name: "Syntax preflight",
      status: syntaxPassed ? "success" : "failure",
      durationMs: 12 + Math.ceil(analysis.summary.lines / 20),
      logs: syntaxPassed
        ? ["Lexical state machine completed with no malformed syntax."]
        : analysis.findings
          .filter((finding) => finding.category === "syntax")
          .slice(0, 8)
          .map((finding) => `${finding.path}:${finding.line}:${finding.column} ${finding.title}`),
    },
    {
      name: "Test discovery",
      status: "success",
      durationMs: 9 + testFiles.length * 3,
      logs: testFiles.length
        ? [`Discovered ${testFiles.length} test ${testFiles.length === 1 ? "file" : "files"}.`, ...testFiles.slice(0, 8).map((file) => `queued ${file.path}`)]
        : ["No test files matched the built-in discovery patterns."],
    },
    {
      name: "Repository intelligence",
      status: "success",
      durationMs: 16 + analysis.summary.files * 2,
      logs: [
        `${analysis.summary.findings} findings ranked; ${criticalFindings} critical.`,
        `${analysis.summary.dependencyEdges} dependency edges and ${analysis.summary.duplicateBlocks} duplicate blocks analyzed.`,
        `Repository health score: ${analysis.summary.score}/100.`,
      ],
    },
  ];
  return {
    status: steps.some((step) => step.status === "failure") ? "failure" : "success",
    durationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
    steps,
  };
}
