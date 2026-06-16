import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { createCardSetupCheckoutSession } from "@/lib/private-pay/checkout";
import { PRIVATE_PAY_CARD_CONSENT_TEXT } from "@/lib/private-pay/card-consent";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { isPrivatePayEmailConfigured, sendPrivatePayResendEmail } from "@/lib/private-pay/email-from";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sendCardAuthSms(to: string, url: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured for SMS.");
  }

  const body = `Saintly Home Health: secure link to authorize your card for private-pay billing: ${url}`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to send SMS.");
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { contactId } = await ctx.params;
  let body: { channel?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }
  const channel = body.channel === "email" ? "email" : "text";

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, full_name, first_name, last_name, email, primary_phone")
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const name =
    (contact.full_name ?? "").trim() ||
    `${(contact.first_name ?? "").trim()} ${(contact.last_name ?? "").trim()}`.trim();

  const setup = await createCardSetupCheckoutSession(contactId, getAppBaseUrl(req.nextUrl.origin), {
    name,
    email: contact.email,
    phone: contact.primary_phone,
  });
  if (!setup.ok) {
    return NextResponse.json({ ok: false, error: setup.error }, { status: setup.status });
  }

  const url = setup.url;

  if (channel === "email") {
    const email = (contact.email ?? "").trim();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Contact has no email on file." }, { status: 400 });
    }
    if (!isPrivatePayEmailConfigured()) {
      return NextResponse.json({ ok: false, error: "Email is not configured." }, { status: 503 });
    }
    const sent = await sendPrivatePayResendEmail({
      to: email,
      subject: "Authorize your card for Saintly Home Health private pay",
      html: `
        <p>Hello${name ? ` ${name}` : ""},</p>
        <p>Use this secure link to add a card for private-pay billing:</p>
        <p><a href="${url}">${url}</a></p>
        <p><strong>Authorization:</strong> ${PRIVATE_PAY_CARD_CONSENT_TEXT}</p>
        <p>If you did not request this, please contact us.</p>
      `,
      text: `Hello${name ? ` ${name}` : ""},\n\nUse this secure link to add a card for private-pay billing:\n${url}\n\nAuthorization: ${PRIVATE_PAY_CARD_CONSENT_TEXT}\n\nIf you did not request this, please contact us.`,
    });
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: sent.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: email, url });
  }

  const phone = (contact.primary_phone ?? "").trim();
  if (!phone) {
    return NextResponse.json({ ok: false, error: "Contact has no phone on file." }, { status: 400 });
  }
  await sendCardAuthSms(phone, url);
  return NextResponse.json({ ok: true, sentTo: formatPhoneForDisplay(phone), url });
}
