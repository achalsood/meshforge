import assert from "node:assert/strict";
import test from "node:test";
import { pullRequestMergeability } from "../lib/repository/merge-policy.ts";

test("an unchanged base with distinct head is mergeable", () => {
  assert.deepEqual(pullRequestMergeability({ status: "open", openedBaseOid: "base", currentBaseOid: "base", currentHeadOid: "head" }), { mergeable: true, reason: "ready" });
});

test("a moved base rejects stale review state", () => {
  assert.deepEqual(pullRequestMergeability({ status: "open", openedBaseOid: "old", currentBaseOid: "new", currentHeadOid: "head" }), { mergeable: false, reason: "base-moved" });
});

test("closed and empty pull requests are not mergeable", () => {
  assert.equal(pullRequestMergeability({ status: "merged", openedBaseOid: "base", currentBaseOid: "base", currentHeadOid: "head" }).mergeable, false);
  assert.equal(pullRequestMergeability({ status: "open", openedBaseOid: "same", currentBaseOid: "same", currentHeadOid: "same" }).reason, "no-changes");
});
