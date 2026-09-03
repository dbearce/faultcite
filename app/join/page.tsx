import type { Metadata } from "next";
import { requireAuthUser, signOutPath } from "../auth";
import { JoinInvitation } from "./join-invitation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept Invitation" };

async function ProtectedInvitation({ token }: { token: string }) {
  const returnTo = token ? `/join?token=${encodeURIComponent(token)}` : "/join";
  const user = await requireAuthUser(returnTo);
  return <JoinInvitation token={token} signedInEmail={user.email} signOutPath={await signOutPath(returnTo)} />;
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <ProtectedInvitation token={token} />;
}
