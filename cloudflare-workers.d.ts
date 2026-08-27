declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    BUCKET: R2Bucket;
    CLERK_SECRET_KEY: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string;
    FAULTCITE_APP_ORIGIN: string;
    RESEND_API_KEY: string;
    FAULTCITE_FROM_EMAIL: string;
    FAULTCITE_ENVIRONMENT: string;
  };
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

interface R2ObjectBody {
  body: ReadableStream;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView, options?: unknown): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: { limit?: number }): Promise<{ objects: unknown[] }>;
}
