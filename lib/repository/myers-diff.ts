export interface DiffStats {
  insertions: number;
  deletions: number;
  unchanged: number;
}

function lines(value: string): string[] {
  if (!value) return [];
  const result = value.split("\n");
  if (result.at(-1) === "") result.pop();
  return result;
}

/** Myers shortest-edit-path line diff: O((N + M)D) time and O(N + M) space. */
export function myersDiffStats(before: string, after: string): DiffStats {
  const left = lines(before);
  const right = lines(after);
  const maximum = left.length + right.length;
  const frontier = new Map<number, number>([[1, 0]]);

  for (let distance = 0; distance <= maximum; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      const rightward = frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY;
      let x = diagonal === -distance || (diagonal !== distance && rightward < down)
        ? Math.max(0, down)
        : Math.max(0, rightward + 1);
      let y = x - diagonal;
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x += 1;
        y += 1;
      }
      frontier.set(diagonal, x);
      if (x >= left.length && y >= right.length) {
        const deletions = (distance + left.length - right.length) / 2;
        const insertions = distance - deletions;
        return { insertions, deletions, unchanged: left.length - deletions };
      }
    }
  }
  return { insertions: right.length, deletions: left.length, unchanged: 0 };
}
