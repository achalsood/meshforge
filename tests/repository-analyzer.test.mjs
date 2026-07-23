import assert from "node:assert/strict";
import test from "node:test";
import { analyzeRepository } from "../lib/intelligence/repository-analyzer.ts";

test("builds dependency edges and ranks severe findings first", () => {
  const result = analyzeRepository([
    { path: "src/a.ts", content: 'import { b } from "./b";\nconst apiKey = "abcdefghijk";\nexport const a = b;' },
    { path: "src/b.ts", content: "export const b = 1;" },
  ]);
  assert.deepEqual(result.dependencies, [{ from: "src/a.ts", to: "src/b.ts", external: false }]);
  assert.equal(result.findings[0].severity, "critical");
  assert.equal(result.summary.files, 2);
});

test("generates an allocation-free patch for typed-array norms", () => {
  const source = "export function norm(vector: Float32Array) {\n  const magnitude = Math.hypot(...vector) || 1;\n  return magnitude;\n}";
  const result = analyzeRepository([{ path: "norm.ts", content: source }]);
  const finding = result.findings.find((item) => item.title.includes("spread allocation"));
  assert.ok(finding?.patch);
  assert.match(finding.patch.after, /sumSquares/);
  assert.equal(finding.line, 2);
});

test("detects verified duplicate blocks without flagging same-file windows", () => {
  const block = "function shared() {\n  const alpha = 1;\n  const beta = 2;\n  const gamma = alpha + beta;\n  return gamma;\n}";
  const result = analyzeRepository([{ path: "a.ts", content: block }, { path: "b.ts", content: block }]);
  assert.equal(result.summary.duplicateBlocks, 1);
  assert.ok(result.findings.some((finding) => finding.title === "Duplicate implementation block"));
});

test("reports unmatched delimiters with an exact line and column", () => {
  const result = analyzeRepository([{ path: "broken.ts", content: "function broken() {\n  return [1, 2);\n}" }]);
  const finding = result.findings.find((item) => item.category === "syntax" && item.title.includes("Unexpected"));
  assert.equal(finding?.line, 2);
  assert.equal(finding?.column, 15);
  assert.ok(result.summary.syntaxErrors >= 1);
});

test("ignores delimiters inside strings, comments, and regular expressions", () => {
  const source = "const text = '{]';\n// }}}\nconst pattern = /[{}()]/;\nexport { text, pattern };";
  const result = analyzeRepository([{ path: "valid.ts", content: source }]);
  assert.equal(result.findings.filter((finding) => finding.category === "syntax").length, 0);
});

test("catches unterminated literals, missing expressions, and invalid JSON", () => {
  const stringResult = analyzeRepository([{ path: "string.ts", content: "const value = 'broken\nexport { value };" }]);
  assert.ok(stringResult.findings.some((finding) => finding.title === "Unterminated string literal"));
  const expressionResult = analyzeRepository([{ path: "expression.ts", content: "const count = ;" }]);
  assert.ok(expressionResult.findings.some((finding) => finding.title === "Missing assignment expression"));
  const jsonResult = analyzeRepository([{ path: "config.json", content: '{"strict": true,}' }]);
  assert.ok(jsonResult.findings.some((finding) => finding.title === "Invalid JSON syntax"));
});
