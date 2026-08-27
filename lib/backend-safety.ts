const MAX_JSON_BODY_BYTES = 32 * 1024;
const MAX_AUDIT_METADATA_BYTES = 8 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const SENSITIVE_METADATA_KEY = /authorization|cookie|password|secret|token|api.?key/i;

export async function readJsonObject(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Request body is too large.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON request."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("A JSON object is required.");
  return parsed as Record<string, unknown>;
}

export function requireBoundedUpload(request: Request, maxFileBytes: number): Response | null {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return apiError("Upload size could not be verified. Re-select the file and try again.", 411);
  const declaredLength = Number(rawLength);
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) return apiError("Upload size is invalid.");
  if (declaredLength > maxFileBytes + MAX_MULTIPART_OVERHEAD_BYTES) return apiError("Upload request is too large.", 413);
  return null;
}

function safeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 1_000);
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map(item => safeAuditValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
      key.slice(0, 100), SENSITIVE_METADATA_KEY.test(key) ? "[redacted]" : safeAuditValue(item, depth + 1),
    ]));
  }
  return String(value).slice(0, 1_000);
}

export function serializeAuditMetadata(metadata: unknown): string | null {
  if (metadata === undefined || metadata === null) return null;
  const json = JSON.stringify(safeAuditValue(metadata));
  return new TextEncoder().encode(json).byteLength <= MAX_AUDIT_METADATA_BYTES
    ? json
    : JSON.stringify({ truncated: true });
}

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
