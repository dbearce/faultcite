"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, MailCheck, ShieldCheck } from "lucide-react";

export function JoinInvitation({ token, signedInEmail, signOutPath }: { token: string; signedInEmail: string; signOutPath: string }) {
  const [state, setState] = useState<"ready" | "saving" | "done" | "error">(token ? "ready" : "error");
  const [message, setMessage] = useState(token ? "" : "This invitation link is incomplete. Ask the company manager to resend it.");
  const successRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (state === "done") successRef.current?.focus(); }, [state]);
  async function accept() {
    setState("saving"); setMessage("");
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) { setState("error"); setMessage(payload?.error || "Invitation could not be accepted."); return; }
      window.history.replaceState({}, "", "/join"); setState("done");
    } catch { setState("error"); setMessage("FaultCite could not be reached. Check the connection and try again."); }
  }
  return <main className="join-page"><section className="join-card" aria-busy={state === "saving"}><div className="join-mark">FC</div><small>FAULTCITE COMPANY INVITATION</small><h1>Join the maintenance workspace</h1><p>This one-time invitation expires after seven days and works only for the invited email address.</p><div className="join-identity"><MailCheck aria-hidden="true" /><span><small>SIGNED IN AS</small><strong>{signedInEmail}</strong></span></div><p className="join-account-help">If this is not the address that received the invitation, sign out and use the invited account.</p><a className="join-sign-out" href={signOutPath}><LogOut aria-hidden="true" />Use a different account</a><div className="join-trust"><ShieldCheck aria-hidden="true" /><span><strong>Company-controlled access</strong><small>Cases, machines, manuals, and evidence stay inside the invited company workspace.</small></span></div>{state === "done" ? <><h2 ref={successRef} tabIndex={-1} className="success">Invitation accepted</h2><p role="status">Your company workspace is ready and selected.</p><Link className="primary" href="/">Open FaultCite workspace</Link></> : <><button className="primary" disabled={!token || state === "saving"} onClick={accept}>{state === "saving" ? "Joining workspace…" : "Accept secure invitation"}</button>{state === "error" && <div className="error" role="alert">{message}</div>}</>}</section></main>;
}
