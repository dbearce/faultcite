import type { Metadata } from "next";
import { TechnicianConsole } from "./technician-console";
import { requireAuthUser, signOutPath } from "./auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Maintenance Workspace" };

export default async function Home() {
  const user = await requireAuthUser("/");
  return <TechnicianConsole signedInName={user.displayName} signedInEmail={user.email} signOutPath={await signOutPath("/")} />;
}
