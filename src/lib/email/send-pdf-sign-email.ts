import "server-only";

const SUBJECT = "Document to sign — Saintly Home Health";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SendPdfSignLinkEmailInput = {
  to: string;
  recipientName?: string | null;
  link: string;
  documentLabel: string;
};

export async function sendPdfSignLinkEmail(
  input: SendPdfSignLinkEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    return { ok: false, error: "Email is not configured (RESEND_API_KEY / RESEND_FROM)." };
  }
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) return { ok: false, error: "Invalid email address." };

  const name = (input.recipientName || "").trim() || "there";
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>Please review and sign your document: <strong>${escapeHtml(input.documentLabel)}</strong>.</p>
<p style="margin:28px 0;">
  <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Open secure signing link</a>
</p>
<p class="small">This link is private. Do not forward. The completed PDF is not attached to this message for security.</p>
<p>— Saintly Home Health</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: SUBJECT,
      html,
      text: `Hi ${name},\n\nSign "${input.documentLabel}" here:\n${input.link}\n\n— Saintly Home Health`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || res.statusText };
  }
  return { ok: true };
}

export function isPdfSignEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}
