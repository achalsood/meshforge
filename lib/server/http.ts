import { DomainError } from "./errors.ts";

const encoder = new TextEncoder();

export async function readJson<T>(request: Request, maxBytes = 64_000): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new DomainError("Content-Type must be application/json", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new DomainError("Request payload is too large", 413);
  }

  const raw = await request.text();
  if (encoder.encode(raw).byteLength > maxBytes) {
    throw new DomainError("Request payload is too large", 413);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new DomainError("Invalid JSON", 400);
  }
}
