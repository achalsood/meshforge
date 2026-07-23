import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRepositoryWorkflow } from "../lib/actions/workflow-engine.ts";

test("passes a valid repository and discovers tests", () => {
  const result = evaluateRepositoryWorkflow([
    { path: "src/math.ts", content: "export const add = (a, b) => a + b;" },
    { path: "tests/math.test.ts", content: "assert.equal(add(1, 2), 3);" },
  ]);
  assert.equal(result.status, "success");
  assert.ok(result.steps.some((step) => step.name === "Test discovery" && step.logs[0].includes("1 test file")));
});

test("fails the workflow when syntax preflight finds malformed code", () => {
  const result = evaluateRepositoryWorkflow([{ path: "src/broken.ts", content: "export const broken = [1, 2);" }]);
  assert.equal(result.status, "failure");
  const syntax = result.steps.find((step) => step.name === "Syntax preflight");
  assert.equal(syntax?.status, "failure");
  assert.ok(syntax?.logs[0].includes("src/broken.ts:1:"));
});
