"use client";

import { FormEvent, useState } from "react";

export function FeedbackForm() {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const form = event.currentTarget; const data = new FormData(form); const category = String(data.get("category"));
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ category, severity: category === "safety_concern" ? "urgent" : data.get("severity"), message: data.get("message"), caseNumber: data.get("caseNumber"), contactRequested: data.get("contactRequested") === "on" }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Feedback could not be saved.");
      form.reset(); setSent(true); setMessage("Saved in your company pilot record. A support contact request is not an emergency alert.");
    } catch (failure) {
      setSent(false); setMessage(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Feedback was not saved. Check your connection and try again.");
    } finally { setSaving(false); }
  }
  return <section className="form-card"><h2>Send pilot feedback or request support</h2><p>Use this form for product feedback and trackable support requests. For an immediate hazard, stop work and follow your employer&apos;s emergency process.</p><form onSubmit={submit} aria-busy={saving}><div className="field"><label htmlFor="feedback-category">Type</label><select id="feedback-category" name="category" required defaultValue="product_feedback"><option value="product_feedback">Product feedback</option><option value="support_request">Support request</option><option value="safety_concern">Safety concern — stop work first</option></select></div><div className="field"><label htmlFor="feedback-severity">Priority</label><select id="feedback-severity" name="severity" required defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div className="field"><label htmlFor="feedback-case">Case number <span>Optional</span></label><input id="feedback-case" name="caseNumber" maxLength={80} /></div><div className="field"><label htmlFor="feedback-message">What happened or what should improve?</label><textarea id="feedback-message" name="message" required minLength={10} maxLength={2000} /></div><label className="check"><input type="checkbox" name="contactRequested" />Please contact me about this submission.</label><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save pilot feedback"}</button></form>{message && <p role={sent ? "status" : "alert"}>{message}</p>}</section>;
}
