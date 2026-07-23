function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
    hash ^= hash >>> 13;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  return (hash ^ (hash >>> 13)) >>> 0;
}

/**
 * Produces a compact 128-bit room key from a repository-scoped value.
 * The server always recomputes this key from the authenticated repository
 * context, so callers cannot use an arbitrary room identifier.
 */
export function roomSlug(scope: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const digest = seeds.map((seed) => hash32(scope, seed).toString(16).padStart(8, "0")).join("");
  return `mesh-${digest}`;
}
