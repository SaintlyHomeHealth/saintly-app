import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, markInvoiceSent } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { sendSms } from "@/lib/twilio/send-sms";
import { normalizeUsPhoneForSend } from "@/lib/phone/us-phone-format";
import { formatCentsUsd } from "@/lib/private-pay/format";
import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveOrigin(req: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: { phone?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const digits = normalizeUsPhoneForSend((body.phone ?? "").trim() || (invoice.billing_phone ?? ""));
  if (digits.length !== 10) {
    return NextResponse.json(
      { ok: false, error: "No valid US mobile number on file. Add a billing phone first." },
      { status: 400 }
    );
  }
  const to = `+1${digits}`;
  const link = `${resolveOrigin(req)}/private-pay/pay/${invoice.public_token}`;

  // HIPAA-safe: invoice number, amount, and secure link only. No clinical details.
  const message = `${PRIVATE_PAY_BUSINESS.legalName}: invoice ${invoice.invoice_number} for ${formatCentsUsd(
    invoice.total_cents
  )} is ready. Pay securely (card/Apple Pay): ${link}`;

  const result = await sendSms({ to, body: message });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  await markInvoiceSent(invoiceId);
  const updated = await getInvoiceWithItems(invoiceId);
  return NextResponse.json({ ok: true, invoice: updated, sentTo: to });
}
