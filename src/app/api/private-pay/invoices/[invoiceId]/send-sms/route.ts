import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { getInvoiceWithItems, markInvoiceSent } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { buildPrivatePayInvoicePublicUrl } from "@/lib/private-pay/public-urls";
import { sendSms } from "@/lib/twilio/send-sms";
import { normalizeUsPhoneForSend } from "@/lib/phone/us-phone-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const baseUrl = getAppBaseUrl(req.nextUrl.origin);
  const invoiceUrl = buildPrivatePayInvoicePublicUrl(invoice.public_token, baseUrl);

  const message = `Saintly Home Health: Your private-pay invoice is ready. View/download your invoice and payment options here: ${invoiceUrl}`;

  const result = await sendSms({ to, body: message });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  await markInvoiceSent(invoiceId);
  const updated = await getInvoiceWithItems(invoiceId);
  return NextResponse.json({ ok: true, invoice: updated, sentTo: to, invoiceUrl });
}
