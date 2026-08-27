import { LegalLinks } from "../legal-links";
import { displayEnvironment, FAULTCITE_RELEASE } from "../../lib/release";

export const metadata = { title: "Pilot Support" };

export default function SupportPage() {
  const environment = displayEnvironment(process.env.FAULTCITE_ENVIRONMENT);
  return <main className="policy-page"><article><span className="eyebrow">CONTROLLED PILOT</span><h1>Pilot support</h1><p className="policy-lead">Use the support contact and response schedule listed in your company’s written pilot agreement.</p><h2>Before reporting a problem</h2><ul><li>Record the FaultCite version and environment shown below.</li><li>Record the company workspace, case number, time, device, and browser.</li><li>Describe what you expected and what happened.</li><li>Do not include passwords, session cookies, Clerk/Resend keys, invitation links, or unnecessary maintenance evidence.</li></ul><h2>Safety or operational emergencies</h2><p>FaultCite is not an emergency channel. Stop work and use the employer’s established safety, maintenance, and incident escalation procedures.</p><h2>Service commitments</h2><p>No 24/7 support or uptime SLA applies unless it appears in a signed agreement. During a controlled pilot, a company owner may suspend use when data isolation, authorization, safety, or recovery cannot be confirmed.</p></article><LegalLinks version={FAULTCITE_RELEASE} environment={environment} /></main>;
}
