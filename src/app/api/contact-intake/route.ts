import { NextResponse } from "next/server";

import {
  buildContactIntakeMailtoHref,
  type ContactIntakePayload,
} from "@/lib/marketing/contact-intake-mailto";

function trimStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Validates marketing contact / intake form (including required SMS consent) and returns a mailto URL.
 * Client navigates to the URL so the user’s email app sends the message (no server-side email relay).
 */
export async function POST(req: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  const payload: ContactIntakePayload = {
    name: trimStr(raw.name, 200),
    phone: trimStr(raw.phone, 40),
    email: trimStr(raw.email, 320),
    relation: trimStr(raw.relation, 80) || "self",
    service: trimStr(raw.service, 80) || "general",
    message: trimStr(raw.message, 8000),
    sms_consent: raw.sms_consent === true,
  };

  const result = buildContactIntakeMailtoHref(payload);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error } as const, { status: 400 });
  }

  return NextResponse.json({ ok: true, mailtoHref: result.href } as const);
}
