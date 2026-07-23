export function roomSlug(scope: string): string {
  let hash = 2166136261;
  for (const character of scope) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `synapse-${(hash >>> 0).toString(16)}`;
}
