"use client";

import {
  ClerkProvider,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/react";
import { TechnicianConsole } from "./technician-console";
import { LegalLinks } from "./legal-links";

function SignedInApp({ version, environment }: { version: string; environment: string }) {
  const { user } = useUser();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "FaultCite user";

  return (
    <>
      <div className="clerk-account-control" aria-label="Account menu">
        <UserButton />
      </div>
      <TechnicianConsole signedInName={name} version={version} environment={environment} />
    </>
  );
}

export function AuthShell({ publishableKey, version, environment }: { publishableKey: string; version: string; environment: string }) {
  if (!publishableKey) {
    return <main className="auth-setup-error"><h1>FaultCite configuration required</h1><p>The Clerk publishable key is missing.</p></main>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <AuthState version={version} environment={environment} />
    </ClerkProvider>
  );
}

function AuthState({ version, environment }: { version: string; environment: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="auth-setup-error"><p>Loading FaultCite…</p></main>;
  if (isSignedIn) return <SignedInApp version={version} environment={environment} />;
  return (
    <main className="faultcite-sign-in">
      <div className="sign-in-brand"><span>FAULTCITE</span><h1>Maintenance evidence you can trust.</h1><p>Sign in with the work email invited by your company manager.</p></div>
      <SignIn routing="hash" />
      <LegalLinks version={version} environment={environment} />
    </main>
  );
}
