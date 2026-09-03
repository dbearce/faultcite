declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    BUCKET: R2Bucket;
    FAULTCITE_OWNER_EMAIL?: string;
    FAULTCITE_CONTACT_EMAIL?: string;
    FAULTCITE_OWNER_COMPANY?: string;
    RESEND_API_KEY?: string;
    FAULTCITE_EMAIL_FROM?: string;
    FAULTCITE_APP_ORIGIN?: string;
    FAULTCITE_RUNTIME?: string;
    CLERK_SECRET_KEY?: string;
    CLERK_AUTHORIZED_PARTIES?: string;
  };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = Record<string, unknown>>(): Promise<{ meta: { changes: number }; results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

interface R2ObjectBody {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: unknown): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: { limit?: number; cursor?: string; prefix?: string }): Promise<{ objects: unknown[]; truncated: boolean; cursor?: string }>;
}
