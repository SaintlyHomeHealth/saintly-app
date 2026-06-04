import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl, validateAppBaseUrl } from "@/lib/app-url";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { getInvoiceWithItems } from "@/lib/private-pay/data";
import { buildPrivatePayInvoicePublicUrl } from "@/lib/private-pay/public-urls";
import { sendPrivatePayReceiptSms } from "@/lib/private-pay/send-receipt";
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
  if (invoice.status !== "paid") {
    return NextResponse.json({ ok: false, error: "Receipt is only available after the invoice is paid." }, { status: 400 });
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
  const urlError = validateAppBaseUrl(baseUrl);
  if (urlError) {
    return NextResponse.json({ ok: false, error: urlError }, { status: 500 });
  }
  const receiptLink = buildPrivatePayInvoicePublicUrl(invoice.public_token, baseUrl);

  const result = await sendPrivatePayReceiptSms({ toE164: to, receiptLink });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: to, receiptLink });
}
