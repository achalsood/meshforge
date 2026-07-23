export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Git-inspired SHA-256 identifier over a typed, length-prefixed payload. */
export async function repositoryObjectId(type: "blob" | "tree" | "commit", content: string): Promise<string> {
  const payload = new TextEncoder().encode(`${type} ${utf8Bytes(content)}\0${content}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
