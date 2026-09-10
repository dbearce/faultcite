/**
 * Application security policy shared by the framework and Cloudflare edge.
 *
 * vinext currently emits inline bootstrap scripts, so `unsafe-inline` cannot be
 * removed from script-src without nonce support in the rendering pipeline. Keep
 * the exception visible here rather than allowing the edge and framework
 * policies to drift independently.
 */
export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.faultcite.com",
  "img-src 'self' data: blob: https://img.clerk.com https://clerk.faultcite.com",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://clerk.faultcite.com https://challenges.cloudflare.com",
  "connect-src 'self' https://clerk.faultcite.com https://accounts.faultcite.com",
  "frame-src https://clerk.faultcite.com https://accounts.faultcite.com https://challenges.cloudflare.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

export const APP_SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: APP_CONTENT_SECURITY_POLICY },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] as const;

export function applyAppSecurityHeaders(headers: Headers) {
  for (const { key, value } of APP_SECURITY_HEADERS) headers.set(key, value);
}
