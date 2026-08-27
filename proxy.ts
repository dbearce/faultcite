import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit, rejectCrossSiteMutation } from "./lib/security/api-protection";

function secure(response: NextResponse) {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.faultcite.com; connect-src 'self' https://*.clerk.accounts.dev https://clerk.faultcite.com; frame-src https://*.clerk.accounts.dev https://clerk.faultcite.com; upgrade-insecure-requests");
  return response;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const blocked = rejectCrossSiteMutation(request) || enforceRateLimit(request);
    if (blocked) return secure(new NextResponse(blocked.body, blocked));
  }
  return secure(NextResponse.next());
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
