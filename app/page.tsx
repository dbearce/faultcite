import { AuthShell } from "./auth-shell";
import { displayEnvironment, FAULTCITE_RELEASE } from "../lib/release";

export const dynamic = "force-dynamic";

export default function Home() {
  return <AuthShell publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ""} version={FAULTCITE_RELEASE} environment={displayEnvironment(process.env.FAULTCITE_ENVIRONMENT)} />;
}
