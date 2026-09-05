"use client";

import { useEffect } from "react";

export type ClerkBrowser = {
  load(options?: { publishableKey?: string }): Promise<void>;
  user?: unknown;
  session?: { getToken(options?: { skipCache?: boolean }): Promise<string | null> } | null;
  signOut(options?: { redirectUrl?: string }): Promise<void>;
  mountSignIn(node: HTMLDivElement, options: {
    fallbackRedirectUrl: string;
    signUpFallbackRedirectUrl: string;
    appearance?: { elements?: Record<string, string> };
  }): void;
  unmountSignIn(node: HTMLDivElement): void;
};

declare global {
  interface Window {
    Clerk?: ClerkBrowser;
  }
}

let clerkReady: Promise<ClerkBrowser> | null = null;
let fetchBridgeInstalled = false;
let nativeFetch: typeof window.fetch | null = null;

function loadClerk(publishableKey: string, frontendApi: string): Promise<ClerkBrowser> {
  if (clerkReady) return clerkReady;
  clerkReady = new Promise<ClerkBrowser>((resolve, reject) => {
    const start = async () => {
      const clerk = window.Clerk;
      if (!clerk) throw new Error("Clerk browser client did not initialize.");
      await clerk.load({ publishableKey });
      resolve(clerk);
    };
    if (window.Clerk) {
      void start().catch(reject);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>("#faultcite-clerk-js");
    if (!script) {
      script = document.createElement("script");
      script.id = "faultcite-clerk-js";
      script.src = `${frontendApi.replace(/\/$/, "")}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.clerkPublishableKey = publishableKey;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => void start().catch(reject), { once: true });
    script.addEventListener("error", () => reject(new Error("Clerk browser client could not load.")), { once: true });
  });
  clerkReady = clerkReady.catch(error => {
    clerkReady = null;
    throw error;
  });
  return clerkReady;
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  try {
    const raw = input instanceof Request ? input.url : input.toString();
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function installAuthenticatedFetch(publishableKey: string, frontendApi: string) {
  if (fetchBridgeInstalled) return;
  fetchBridgeInstalled = true;
  nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!nativeFetch || !isSameOriginApiRequest(input)) return (nativeFetch || fetch)(input, init);
    const firstInput = input instanceof Request ? input.clone() : input;
    const retryInput = input instanceof Request ? input.clone() : input;
    try {
      const clerk = await loadClerk(publishableKey, frontendApi);
      const token = await clerk.session?.getToken();
      if (token) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
        if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
        const response = await nativeFetch(firstInput, { ...init, headers, credentials: init?.credentials || "same-origin" });
        if (response.status !== 401 || headers.has("x-faultcite-auth-retry")) return response;
        const freshToken = await clerk.session?.getToken({ skipCache: true });
        if (!freshToken) return response;
        headers.set("authorization", `Bearer ${freshToken}`);
        headers.set("x-faultcite-auth-retry", "1");
        return nativeFetch(retryInput, { ...init, headers, credentials: init?.credentials || "same-origin" });
      }
    } catch {
      // Let the server evaluate the existing cookies and return the normal auth response.
    }
    return nativeFetch(input, init);
  };
}

export function ClerkSessionBridge({ publishableKey, frontendApi }: { publishableKey: string; frontendApi: string }) {
  if (typeof window !== "undefined") installAuthenticatedFetch(publishableKey, frontendApi);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const clerk = await loadClerk(publishableKey, frontendApi);
        if (active) await clerk.session?.getToken({ skipCache: true });
      } catch {
        // Authentication endpoints remain fail-closed if Clerk is unavailable.
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 45_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [frontendApi, publishableKey]);

  return null;
}
