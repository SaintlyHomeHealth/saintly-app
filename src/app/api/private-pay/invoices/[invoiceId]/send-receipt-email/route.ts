import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl, validateAppBaseUrl } from "@/lib/app-url";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { getInvoiceWithItems } from "@/lib/private-pay/data";
import { buildPrivatePayInvoicePublicUrl } from "@/lib/private-pay/public-urls";
import { sendPrivatePayReceiptEmail } from "@/lib/private-pay/send-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: { email?: string } = {};
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

  const to = (body.email ?? "").trim() || (invoice.billing_email ?? "").trim();
  if (!to.includes("@")) {
    return NextResponse.json({ ok: false, error: "No billing email on file." }, { status: 400 });
  }

  const baseUrl = getAppBaseUrl(req.nextUrl.origin);
  const urlError = validateAppBaseUrl(baseUrl);
  if (urlError) {
    return NextResponse.json({ ok: false, error: urlError }, { status: 500 });
  }
  const receiptLink = buildPrivatePayInvoicePublicUrl(invoice.public_token, baseUrl);

  const result = await sendPrivatePayReceiptEmail({
    to,
    billingName: invoice.billing_name,
    invoiceNumber: invoice.invoice_number,
    receiptLink,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: to, receiptLink });
}
