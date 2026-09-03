import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../app/auth.ts", import.meta.url), "utf8");
const backend = await readFile(new URL("../lib/backend.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0021_faultcite_auth_identities.sql", import.meta.url), "utf8");
const signOut = await readFile(new URL("../app/api/auth/sign-out/route.ts", import.meta.url), "utf8");
const inviteEmail = await readFile(new URL("../lib/invitation-email.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const signInPage = await readFile(new URL("../app/sign-in/page.tsx", import.meta.url), "utf8");
const clerkSignIn = await readFile(new URL("../app/sign-in/clerk-sign-in.tsx", import.meta.url), "utf8");
const sessionStatus = await readFile(new URL("../app/api/auth/session/route.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const sessionBridge = await readFile(new URL("../app/clerk-session-bridge.tsx", import.meta.url), "utf8");

test("standalone auth fails closed and verifies Clerk sessions", () => {
  assert.match(auth, /x-faultcite-runtime/);
  assert.match(auth, /if \(!secretKey \|\| !publishableKey\) return null/);
  assert.match(auth, /clerk\.authenticateRequest\(request/);
  assert.match(auth, /requestState\.status === "handshake"/);
  assert.match(auth, /if \(location\) redirect\(location\)/);
  assert.match(auth, /authorizedParties/);
  assert.match(auth, /validHttpsOrigin\(env\.FAULTCITE_APP_ORIGIN\)/);
  assert.match(auth, /primary\.verification\?\.status !== "verified"/);
  assert.match(worker, /env\.FAULTCITE_RUNTIME/);
  assert.match(worker, /forwardedHeaders\.set\("x-faultcite-runtime", "standalone"\)/);
  assert.match(worker, /forwardedHeaders\.set\("x-faultcite-request-url", url\.toString\(\)\)/);
  assert.match(worker, /runWithRequestEnv\(env/);
});

test("keeps the hosted ChatGPT identity path only as the default rollback", () => {
  assert.match(auth, /if \(!\(await isStandaloneRuntime\(\)\)\)/);
  assert.match(auth, /getChatGPTUser/);
});

test("maps Clerk subjects without replacing existing application user IDs", () => {
  assert.match(schema, /authIdentities/);
  assert.match(migration, /auth_identities_provider_subject_uq/);
  assert.match(migration, /auth_identities_provider_user_uq/);
  assert.match(migration, /auth_identities_immutable_update/);
  assert.match(migration, /auth_identities_immutable_delete/);
  assert.match(backend, /where\(eq\(users\.email, email\)\)/);
  assert.match(backend, /bindIdentity\(identity, existing\.id\)/);
});

test("sign-out is POST-only, same-origin, and revokes the Clerk session", () => {
  assert.match(signOut, /export async function POST/);
  assert.doesNotMatch(signOut, /export async function GET/);
  assert.match(signOut, /if \(origin !== requestUrl\.origin\)/);
  assert.match(signOut, /revokeSession/);
});

test("invitation copy is authentication-provider neutral", () => {
  assert.match(inviteEmail, /Sign in to FaultCite/);
  assert.doesNotMatch(inviteEmail, /Sign in to ChatGPT/);
});

test("standalone sign-in establishes the Clerk session on the FaultCite origin", () => {
  assert.match(signInPage, /CLERK_PUBLISHABLE_KEY/);
  assert.match(signInPage, /ClerkSignIn/);
  assert.doesNotMatch(signInPage, /redirect\(target\.toString\(\)\)/);
  assert.match(clerkSignIn, /clerk\.mountSignIn/);
  assert.match(clerkSignIn, /fetch\("\/api\/auth\/session"/);
  assert.match(clerkSignIn, /await clerk\.signOut\(\)/);
  assert.match(clerkSignIn, /faultcite-auth-redirect-at/);
  assert.match(clerkSignIn, /document\.head\.appendChild\(script\)/);
  assert.doesNotMatch(clerkSignIn, /next\/script/);
  assert.match(clerkSignIn, /signUpFallbackRedirectUrl/);
  assert.match(clerkSignIn, /window\.location\.replace\(returnTo\)/);
  assert.match(worker, /https:\/\/clerk\.faultcite\.com/);
  assert.match(worker, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(sessionStatus, /status: user \? 200 : 401/);
  assert.match(sessionStatus, /private, no-store/);
});

test("standalone pages keep Clerk tokens fresh and authenticate same-origin API calls", () => {
  assert.match(layout, /ClerkSessionBridge/);
  assert.match(layout, /x-faultcite-runtime/);
  assert.match(sessionBridge, /clerk\.session\?\.getToken\(\{ skipCache: true \}\)/);
  assert.match(sessionBridge, /url\.origin === window\.location\.origin/);
  assert.match(sessionBridge, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(sessionBridge, /headers\.set\("authorization", `Bearer \$\{token\}`\)/);
  assert.match(sessionBridge, /45_000/);
});
