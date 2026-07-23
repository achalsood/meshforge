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
