import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isStandaloneRuntime, safeRelativeReturnPath } from "../auth";
import { getRequestEnv } from "../../lib/request-env";
import { ClerkSignIn } from "./clerk-sign-in";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const { return_to = "/" } = await searchParams;
  if (!(await isStandaloneRuntime())) redirect("/");

  const env = getRequestEnv();
  const origin = env.FAULTCITE_APP_ORIGIN?.trim();
  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim();
  const frontendApi = env.CLERK_FRONTEND_API?.trim() || "https://clerk.faultcite.com";
  if (!origin || !origin.startsWith("https://")) throw new Error("Standalone application origin is not configured.");
  if (!publishableKey) throw new Error("FaultCite sign-in is not configured.");
  if (!frontendApi.startsWith("https://")) throw new Error("FaultCite identity service is not configured.");

  const destination = new URL(safeRelativeReturnPath(return_to), origin).toString();

  return (
    <main className="standalone-sign-in">
      <section className="standalone-sign-in-card" aria-labelledby="sign-in-title">
        <div className="standalone-sign-in-brand" aria-hidden="true">FC</div>
        <p className="standalone-sign-in-eyebrow">FAULTCITE SECURE ACCESS</p>
        <h1 id="sign-in-title">Sign in to FaultCite</h1>
        <p className="standalone-sign-in-copy">Use the exact email address from your company invitation.</p>
        <ClerkSignIn publishableKey={publishableKey} frontendApi={frontendApi} returnTo={destination} />
        <p className="standalone-sign-in-trust">Your FaultCite workspace stays separate from ChatGPT.</p>
      </section>
    </main>
  );
}
