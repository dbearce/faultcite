import { createClerkClient } from "@clerk/backend";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { getRequestEnv } from "../lib/request-env";

export type AuthUser = {
  provider: "chatgpt" | "clerk";
  subject: string;
  sessionId: string | null;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function isStandaloneRuntime(): Promise<boolean> {
  return (await headers()).get("x-faultcite-runtime") === "standalone";
}

export async function getAuthUser(): Promise<AuthUser | null> {
  if (!(await isStandaloneRuntime())) {
    const user = await getChatGPTUser();
    return user ? { provider: "chatgpt", subject: user.email.toLowerCase(), sessionId: null, ...user } : null;
  }
  return getClerkUser();
}

export async function requireAuthUser(returnTo: string): Promise<AuthUser> {
  const user = await getAuthUser();
  if (user) return user;
  redirect(await signInPath(returnTo));
}

export async function signInPath(returnTo = "/"): Promise<string> {
  if (!(await isStandaloneRuntime())) {
    return chatGPTSignInPath(returnTo);
  }
  return `/sign-in?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function signOutPath(returnTo = "/"): Promise<string> {
  if (!(await isStandaloneRuntime())) {
    return chatGPTSignOutPath(returnTo);
  }
  return `/sign-out?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

async function getClerkUser(): Promise<AuthUser | null> {
  const env = getRequestEnv();
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim();
  if (!secretKey || !publishableKey) return null; // Standalone is deliberately fail-closed.
  const applicationOrigin = validHttpsOrigin(env.FAULTCITE_APP_ORIGIN);
  if (!applicationOrigin) return null;
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const cookieHeader = requestHeaders.get("cookie") || cookieStore.toString();
  const trustedRequestUrl = requestHeaders.get("x-faultcite-request-url");
  const trustedRequestMethod = requestHeaders.get("x-faultcite-request-method") || "GET";
  const requestUrl = trustedRequestUrl?.startsWith(`${applicationOrigin}/`) ? trustedRequestUrl : applicationOrigin;
  const isDocumentRequest = trustedRequestMethod === "GET" && requestHeaders.get("sec-fetch-dest") === "document";
  const configured = (env.CLERK_AUTHORIZED_PARTIES || "").split(",").map((value: string) => validHttpsOrigin(value)).filter((value): value is string => Boolean(value));
  const authorizedParties = Array.from(new Set([
    applicationOrigin,
    ...configured,
  ]));
  const authentication = async () => {
    const clerk = createClerkClient({ secretKey, publishableKey });
    const request = new Request(requestUrl, {
      method: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(trustedRequestMethod) ? trustedRequestMethod : "GET",
      headers: requestHeaders,
    });
    const requestState = await clerk.authenticateRequest(request, {
      authorizedParties,
      secretKey,
      publishableKey,
      signInUrl: `${applicationOrigin}/sign-in`,
      signUpUrl: `${applicationOrigin}/sign-in`,
      afterSignInUrl: applicationOrigin,
      afterSignUpUrl: applicationOrigin,
    });
    return { clerk, requestState };
  };

  let authenticationResult: Awaited<ReturnType<typeof authentication>>;
  try {
    authenticationResult = await authentication();
  } catch (error) {
    console.error("[faultcite-auth] Clerk authentication failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return null;
  }

  const { clerk, requestState } = authenticationResult;
  if (requestState.status === "handshake" && isDocumentRequest) {
    const location = requestState.headers.get("location");
    if (location) redirect(location);
  }
  if (!requestState.isAuthenticated) {
    if (cookieHeader.includes("__session=") || cookieHeader.includes("__client_uat=")) {
      console.warn("[faultcite-auth] Clerk session rejected", { status: requestState.status, reason: requestState.reason });
    }
    return null;
  }

  try {
    const authenticated = requestState.toAuth();
    if (!authenticated.userId || !authenticated.sessionId) return null;
    const user = await clerk.users.getUser(authenticated.userId);
    const primary = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== "verified") return null;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
    return {
      provider: "clerk",
      subject: user.id,
      sessionId: authenticated.sessionId,
      email: primary.emailAddress.trim().toLowerCase(),
      fullName,
      displayName: fullName || primary.emailAddress,
    };
  } catch (error) {
    console.error("[faultcite-auth] Clerk identity lookup failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return null;
  }
}

function validHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/";
    if (["/sign-in", "/sign-out", "/api/auth/sign-out"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}
