import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, markInvoiceSent } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { sendPrivatePayInvoiceEmail } from "@/lib/private-pay/send-invoice-email";

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

  const link = `${resolveOrigin(req)}/private-pay/pay/${invoice.public_token}`;
  const result = await sendPrivatePayInvoiceEmail({
    to,
    billingName: invoice.billing_name,
    invoiceNumber: invoice.invoice_number,
    totalCents: invoice.total_cents,
    link,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  await markInvoiceSent(invoiceId);
  const updated = await getInvoiceWithItems(invoiceId);
  return NextResponse.json({ ok: true, invoice: updated, sentTo: to });
}
