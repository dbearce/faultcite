type DeliveryResult = {
  status: "sent" | "not_configured" | "failed";
  message: string;
  providerMessageId?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function sendInvitationEmail(input: {
  to: string;
  role: string;
  companyName: string;
  inviterName: string;
  acceptUrl: string;
  expiresAt: Date;
}): Promise<DeliveryResult> {
  const { env } = await import("cloudflare:workers");
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.FAULTCITE_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return {
      status: "not_configured",
      message: "Email delivery is not configured. Copy the secure link instead.",
    };
  }

  const company = escapeHtml(input.companyName);
  const inviter = escapeHtml(input.inviterName);
  const role = escapeHtml(input.role);
  const acceptUrl = escapeHtml(input.acceptUrl);
  const expires = escapeHtml(input.expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }));

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // Resend rejects some server-side requests without an identifying
        // User-Agent (403 / error 1010). Cloudflare fetch does not guarantee
        // that one is added automatically.
        "user-agent": "FaultCite/1.0 (+https://app.faultcite.com)",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `${input.companyName} invited you to FaultCite`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172535"><h1 style="font-size:24px">You are invited to FaultCite</h1><p>${inviter} invited you to join <strong>${company}</strong> as a ${role}.</p><p><a href="${acceptUrl}" style="display:inline-block;background:#a72f34;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Accept invitation</a></p><p>This single-use link expires on ${expires}. Sign in to FaultCite with the same verified email address that received this message.</p><p style="font-size:13px;color:#5e7180">FaultCite is a controlled pilot for authorized maintenance personnel. If you were not expecting this invitation, do not open the link.</p></div>`,
        text: `${input.inviterName} invited you to join ${input.companyName} in FaultCite as a ${input.role}. Accept the invitation: ${input.acceptUrl}\n\nThe link is single-use and expires on ${expires}. Sign in to FaultCite with ${input.to}. If you were not expecting this invitation, do not open the link.`,
      }),
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => null) as { message?: string } | null;
      const reason = response.status === 401
        ? "The Resend API key was rejected."
        : response.status === 403
          ? "Resend has not authorized this sender domain or API request."
          : response.status === 429
            ? "Resend's sending limit was reached."
            : response.status >= 500
              ? "Resend is temporarily unavailable."
              : providerError?.message
                ? `Resend rejected the message: ${providerError.message.slice(0, 180)}`
                : `Resend rejected the message (status ${response.status}).`;
      return { status: "failed", message: `The invitation was saved, but email was not sent. ${reason} Copy the secure link or try again.` };
    }
    const provider = await response.json().catch(() => null) as { id?: string } | null;
    return { status: "sent", message: `Invitation submitted to the email provider for ${input.to}.`, providerMessageId: provider?.id };
  } catch {
    return { status: "failed", message: "The invitation was saved, but email delivery could not be reached. Copy the secure link or try again." };
  }
}
