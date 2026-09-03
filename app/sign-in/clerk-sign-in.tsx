"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function ClerkSignIn({ publishableKey, frontendApi, returnTo }: {
  publishableKey: string;
  frontendApi: string;
  returnTo: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const loadingTimeoutRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scriptUrl = `${frontendApi.replace(/\/$/, "")}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;

  const mount = useCallback(async () => {
    const clerk = window.Clerk;
    const node = mountRef.current;
    if (!clerk || !node || mountedRef.current) return;

    try {
      await clerk.load({ publishableKey });
      if (clerk.user) {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          const previousRedirect = Number(window.sessionStorage.getItem("faultcite-auth-redirect-at") || 0);
          if (Date.now() - previousRedirect >= 8_000) {
            window.sessionStorage.setItem("faultcite-auth-redirect-at", String(Date.now()));
            window.location.replace(returnTo);
            return;
          }
          setNotice("FaultCite stopped a repeated sign-in redirect. Please sign in again.");
        } else {
          setNotice("Your previous sign-in expired. Please sign in again.");
        }
        await clerk.signOut();
        window.sessionStorage.removeItem("faultcite-auth-redirect-at");
      }
      clerk.mountSignIn(node, {
        fallbackRedirectUrl: returnTo,
        signUpFallbackRedirectUrl: returnTo,
      });
      mountedRef.current = true;
      if (loadingTimeoutRef.current !== null) window.clearTimeout(loadingTimeoutRef.current);
      setMounted(true);
    } catch {
      if (loadingTimeoutRef.current !== null) window.clearTimeout(loadingTimeoutRef.current);
      setError("Sign-in could not load. Check your connection and try again.");
    }
  }, [publishableKey, returnTo]);

  useEffect(() => {
    const node = mountRef.current;
    let script = document.querySelector<HTMLScriptElement>("#faultcite-clerk-js");
    const handleLoad = () => void mount();
    const handleError = () => {
      if (loadingTimeoutRef.current !== null) window.clearTimeout(loadingTimeoutRef.current);
      setError("Sign-in could not load. Check your connection and try again.");
    };
    loadingTimeoutRef.current = window.setTimeout(handleError, 12_000);

    if (window.Clerk) {
      queueMicrotask(handleLoad);
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = "faultcite-clerk-js";
        script.src = scriptUrl;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.dataset.clerkPublishableKey = publishableKey;
        document.head.appendChild(script);
      }
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }

    return () => {
      if (loadingTimeoutRef.current !== null) window.clearTimeout(loadingTimeoutRef.current);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      if (mountedRef.current && node && window.Clerk) {
        window.Clerk.unmountSignIn(node);
        mountedRef.current = false;
      }
    };
  }, [attempt, mount, publishableKey, scriptUrl]);

  const retry = () => {
    setError("");
    setNotice("");
    setMounted(false);
    mountedRef.current = false;
    if (!window.Clerk) document.querySelector("#faultcite-clerk-js")?.remove();
    setAttempt(value => value + 1);
  };

  return (
    <div className="standalone-sign-in-widget">
      <div ref={mountRef} className="standalone-sign-in-mount" aria-live="polite" />
      {!mounted && !error ? <p className="standalone-sign-in-loading">Loading secure sign-in…</p> : null}
      {notice ? <p className="standalone-sign-in-notice" role="status">{notice}</p> : null}
      {error ? <div className="standalone-sign-in-error" role="alert"><p>{error}</p><button type="button" className="secondary" onClick={retry}>Try sign-in again</button></div> : null}
    </div>
  );
}
