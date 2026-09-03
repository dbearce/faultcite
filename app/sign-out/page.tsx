import { safeRelativeReturnPath } from "../auth";

export const dynamic = "force-dynamic";

export default async function SignOutPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const { return_to = "/" } = await searchParams;
  return <main className="join-page"><section className="join-card"><div className="join-mark">FC</div><small>FAULTCITE SECURE SESSION</small><h1>Sign out of FaultCite?</h1><p>This ends your current FaultCite session on this device.</p><form method="post" action="/api/auth/sign-out"><input type="hidden" name="return_to" value={safeRelativeReturnPath(return_to)} /><button className="primary" type="submit">Sign out</button></form><a className="secondary" href={safeRelativeReturnPath(return_to)}>Cancel</a></section></main>;
}
