import type { NextRequest } from "next/server";

import { formDataToStringRecord } from "@/lib/twilio/verify-form-post";

import {
  normalizeDefaultInboundEmail,
  normalizeMailgunInboundEmail,
  normalizeResendInboundEmail,
  normalizeSendgridInboundEmail,
} from "./normalize-providers";
import type { InboundEmailNormalized } from "./types";
import { canonicalInboundEmailSchema } from "./zod-schemas";

function firstString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

export type InboundProviderHint = "default" | "resend" | "sendgrid" | "mailgun" | "auto";

function recordFromObject(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function detectShape(raw: Record<string, unknown>): "resend" | "sendgrid" | "mailgun" | "default" {
  const t = firstString(raw.type)?.toLowerCase() ?? "";
  if (t === "email.received") return "resend";
  if (raw.data && typeof raw.data === "object" && raw.data !== null && "from" in (raw.data as object)) {
    const d = raw.data as Record<string, unknown>;
    if (firstString(d.email_id) || firstString(d.id)) return "resend";
  }
  if (typeof raw.envelope === "string" && raw.envelope.includes("to") && firstString(raw.headers)) {
    return "sendgrid";
  }
  if (firstString(raw.sender) && firstString(raw.recipient)) {
    return "mailgun";
  }
  return "default";
}

export async function parseInboundEmailRequest(req: NextRequest): Promise<
  | { ok: true; normalized: InboundEmailNormalized; rawRecord: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const hint = (req.headers.get("x-saintly-inbound-provider")?.trim().toLowerCase() ?? "auto") as InboundProviderHint;

  const ct = req.headers.get("content-type") ?? "";
  let rawRecord: Record<string, unknown>;

  try {
    if (ct.includes("application/json")) {
      rawRecord = recordFromObject(await req.json());
    } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = (await req.formData()) as unknown as Parameters<typeof formDataToStringRecord>[0];
      rawRecord = formDataToStringRecord(fd) as Record<string, unknown>;
    } else {
      return { ok: false, error: "unsupported_content_type" };
    }
  } catch {
    return { ok: false, error: "invalid_body" };
  }

  let shape: "resend" | "sendgrid" | "mailgun" | "default";
  if (hint === "resend") shape = "resend";
  else if (hint === "sendgrid") shape = "sendgrid";
  else if (hint === "mailgun") shape = "mailgun";
  else if (hint === "default") shape = "default";
  else shape = detectShape(rawRecord);

  let normalized: InboundEmailNormalized;
  switch (shape) {
    case "resend":
      normalized = normalizeResendInboundEmail(rawRecord);
      break;
    case "sendgrid":
      normalized = normalizeSendgridInboundEmail(rawRecord);
      break;
    case "mailgun":
      normalized = normalizeMailgunInboundEmail(rawRecord);
      break;
    default: {
      const parsed = canonicalInboundEmailSchema.safeParse(rawRecord);
      if (!parsed.success) {
        return { ok: false, error: "canonical_validation_failed" };
      }
      normalized = normalizeDefaultInboundEmail(parsed.data as Record<string, unknown>, parsed.data.provider ?? "default");
      break;
    }
  }

  if (!normalized.fromEmail?.includes("@")) {
    return { ok: false, error: "missing_from_email" };
  }
  if (!normalized.toEmails?.length) {
    return { ok: false, error: "missing_to_emails" };
  }

  normalized.raw = normalized.raw ?? rawRecord;
  return { ok: true, normalized, rawRecord };
}
