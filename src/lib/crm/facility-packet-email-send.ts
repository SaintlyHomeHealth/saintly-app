import "server-only";

import {
  getFacilityPacketEmailSender,
  isFacilityPacketEmailConfigured,
} from "@/lib/crm/facility-packet-email-from";

export type PacketEmailAttachment = {
  filename: string;
  content: string;
};

export async function sendFacilityPacketEmail(input: {
  to: string;
  subject: string;
  message: string;
  html?: string;
  externalLinks?: Array<{ label: string; url: string }>;
  attachments?: PacketEmailAttachment[];
}): Promise<
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: "EMAIL_NOT_CONFIGURED" | "SEND_FAILED"; message: string }
> {
  if (!isFacilityPacketEmailConfigured()) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email sending is not configured. Use Mark Sent instead.",
    };
  }

  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) {
    return { ok: false, code: "SEND_FAILED", message: "Invalid recipient email." };
  }

  const key = process.env.RESEND_API_KEY!.trim();
  const { from, replyTo } = getFacilityPacketEmailSender();

  const linkBlock =
    input.externalLinks && input.externalLinks.length
      ? `\n\nAdditional materials:\n${input.externalLinks.map((l) => `- ${l.label}: ${l.url}`).join("\n")}`
      : "";

  const text = `${input.message.trim()}${linkBlock}`;
  const html =
    input.html ??
    `<div style="font-family:system-ui,sans-serif;line-height:1.5;white-space:pre-wrap">${escapeHtml(input.message.trim())}${input.externalLinks?.length ? `<p><strong>Additional materials:</strong></p><ul>${input.externalLinks.map((l) => `<li><a href="${escapeAttr(l.url)}">${escapeHtml(l.label)}</a></li>`).join("")}</ul>` : ""}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [to],
      subject: input.subject.trim() || "Saintly Home Health Referral Packet",
      html,
      text,
      attachments: input.attachments?.length ? input.attachments : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      code: "SEND_FAILED",
      message: body || res.statusText || "Email send failed.",
    };
  }

  let providerMessageId: string | null = null;
  try {
    const json = (await res.json()) as { id?: string };
    providerMessageId = json.id ?? null;
  } catch {
    providerMessageId = null;
  }

  return { ok: true, providerMessageId };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
