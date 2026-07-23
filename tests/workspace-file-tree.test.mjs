import assert from "node:assert/strict";
import test from "node:test";

import { buildFileTree } from "../lib/workspace/build-file-tree.ts";

test("builds a deterministic de-duplicated repository tree", () => {
  const items = buildFileTree([
    "src/utils/math.ts",
    "README.md",
    "src/index.ts",
    "src/utils/format.ts",
    ".gitignore",
  ]);

  assert.deepEqual(items.map(({ path, type, depth }) => ({ path, type, depth })), [
    { path: ".gitignore", type: "git", depth: 0 },
    { path: "README.md", type: "book", depth: 0 },
    { path: "src", type: "folder-open", depth: 0 },
    { path: "src/index.ts", type: "ts", depth: 1 },
    { path: "src/utils", type: "folder-open", depth: 1 },
    { path: "src/utils/format.ts", type: "ts", depth: 2 },
    { path: "src/utils/math.ts", type: "ts", depth: 2 },
  ]);
});
