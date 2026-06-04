import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { getInvoiceWithItems, markInvoiceSent } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { buildPrivatePayInvoicePublicUrl } from "@/lib/private-pay/public-urls";
import { sendPrivatePayInvoiceEmail } from "@/lib/private-pay/send-invoice-email";

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

  const to = (body.email ?? "").trim() || (invoice.billing_email ?? "").trim();
  if (!to) {
    return NextResponse.json(
      { ok: false, error: "No email on file. Add a billing email to the invoice first." },
      { status: 400 }
    );
  }

  const baseUrl = getAppBaseUrl(req.nextUrl.origin);
  const invoiceUrl = buildPrivatePayInvoicePublicUrl(invoice.public_token, baseUrl);

  const result = await sendPrivatePayInvoiceEmail({
    to,
    billingName: invoice.billing_name,
    invoiceNumber: invoice.invoice_number,
    totalCents: invoice.total_cents,
    link: invoiceUrl,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  await markInvoiceSent(invoiceId);
  const updated = await getInvoiceWithItems(invoiceId);
  return NextResponse.json({ ok: true, invoice: updated, sentTo: to, invoiceUrl });
}
