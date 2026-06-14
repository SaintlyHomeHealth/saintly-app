import "server-only";

const DEFAULT_FROM_NAME = "Saintly Home Health";
const DEFAULT_FROM_EMAIL = "info@saintlyhomehealth.com";

export type FacilityPacketEmailSender = {
  from: string;
  replyTo: string;
  name: string;
};

export function getFacilityPacketEmailSender(): FacilityPacketEmailSender {
  const name = (process.env.FACILITY_PACKET_FROM_NAME ?? "").trim() || DEFAULT_FROM_NAME;
  const email =
    (process.env.FACILITY_PACKET_FROM_EMAIL ?? "").trim() ||
    (process.env.RESEND_FROM ?? "").trim() ||
    DEFAULT_FROM_EMAIL;
  const replyTo =
    (process.env.FACILITY_PACKET_REPLY_TO ?? "").trim() ||
    email;
  return {
    from: `${name} <${email}>`,
    replyTo: replyTo.includes("@") ? replyTo : email,
    name,
  };
}

export function isFacilityPacketEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    (process.env.FACILITY_PACKET_FROM_EMAIL ?? "").trim() ||
    (process.env.RESEND_FROM ?? "").trim();
  return Boolean(key && from && from.includes("@"));
}

export function isFacilityPacketFaxConfigured(): boolean {
  return Boolean(
    process.env.TELNYX_API_KEY?.trim() && process.env.TELNYX_FAX_CONNECTION_ID?.trim()
  );
}

export function defaultPacketEmailSubject(): string {
  return "Saintly Home Health Referral Packet";
}

export function defaultPacketEmailMessage(recipientName?: string | null): string {
  const greeting = recipientName?.trim() ? `Hello ${recipientName.trim()},` : "Hello,";
  return `${greeting}

Thank you for speaking with us. Attached is the Saintly Home Health packet for your office.

Please let us know if you need anything else or if there is a specific referral process we should follow.

Thank you,
Saintly Home Health`;
}

export function defaultPacketFaxCoverSheet(input: {
  recipientName?: string | null;
  recipientOrganization?: string | null;
  coverNote?: string | null;
}): string {
  const to = [input.recipientName, input.recipientOrganization].filter(Boolean).join(" · ") || "Recipient";
  const body =
    input.coverNote?.trim() ||
    "Please see attached Saintly Home Health referral packet. Thank you.";
  return `To: ${to}
From: Saintly Home Health
Subject: Saintly Home Health Referral Packet

${body}`;
}
