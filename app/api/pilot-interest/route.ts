const MARKETING_ORIGIN = "https://faultcite.com";

function clean(value: FormDataEntryValue | null, maximum: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function redirectToPilot(status: "received" | "invalid" | "busy") {
  return Response.redirect(`${MARKETING_ORIGIN}/pilot.html?status=${status}`, 303);
}

export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const origin = request.headers.get("origin");
  if (origin !== MARKETING_ORIGIN && origin !== "https://www.faultcite.com") return Response.json({ error: "Origin not allowed" }, { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return redirectToPilot("invalid"); }
  if (clean(form.get("website"), 200)) return redirectToPilot("received");
  const name = clean(form.get("name"), 120);
  const email = clean(form.get("email"), 254).toLowerCase();
  const company = clean(form.get("company"), 180);
  const message = clean(form.get("message"), 1600);
  if (name.length < 2 || company.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirectToPilot("invalid");

  const forwarded = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pilot-interest:${forwarded}`));
  const key = `public-pilot:${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  const now = Date.now(); const resetAt = now + 60 * 60 * 1000;
  const bucket = await env.DB.prepare("INSERT INTO rate_limit_buckets (key,count,reset_at,updated_at) VALUES (?,1,?,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END, updated_at=? RETURNING count,reset_at")
    .bind(key, resetAt, now, now, now, resetAt, now).first<{ count: number; reset_at: number }>();
  if (!bucket || (bucket.reset_at > now && bucket.count > 5)) return redirectToPilot("busy");

  await env.DB.prepare("INSERT INTO pilot_interest (id,name,work_email,company,message,source,created_at) VALUES (?,?,?,?,?,'faultcite.com',?)")
    .bind(crypto.randomUUID(), name, email, company, message || null, now).run();

  const apiKey = env.RESEND_API_KEY?.trim(); const contact = env.FAULTCITE_CONTACT_EMAIL?.trim();
  if (apiKey && contact) {
    const safe = (value: string) => value.replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
    try {
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ from: env.FAULTCITE_EMAIL_FROM || "FaultCite <invites@faultcite.com>", to: [contact], reply_to: email, subject: `FaultCite pilot request — ${company}`, html: `<p><strong>${safe(name)}</strong> from <strong>${safe(company)}</strong> requested a FaultCite pilot.</p><p>Email: ${safe(email)}</p><p>${safe(message || "No additional message provided.")}</p>` }) });
    } catch { console.warn("[faultcite-pilot-interest] notification delivery failed"); }
  }
  return redirectToPilot("received");
}
