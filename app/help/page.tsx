import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Help and Safety" };

export default async function Help(){
  const {env}=await import("cloudflare:workers");
  const contactEmail=env.FAULTCITE_CONTACT_EMAIL?.trim()||"admin@faultcite.com";
  return <main className="page focused"><div className="flow-title"><span className="eyebrow">FAULTCITE HELP & SAFETY</span><h1>Use FaultCite as a maintenance record—not as work authorization.</h1><p>Follow your employer’s LOTO program, OEM documentation, qualifications, and site procedures. Stop and contact supervision whenever machine identity, energy state, or authorization is uncertain.</p></div><section className="form-card"><h2>Getting help</h2><p>For FaultCite account or record support, email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Company-specific access and maintenance questions should still go to your company owner or manager.</p><p>For an immediate safety hazard, stop work and use your employer’s emergency and escalation process. FaultCite is not an emergency service.</p><Link className="primary" href="/">Return to FaultCite</Link></section><FeedbackForm /></main>
}
