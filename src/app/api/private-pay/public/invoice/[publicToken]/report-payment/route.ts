import { NextResponse, type NextRequest } from "next/server";

import { dollarsToCents } from "@/lib/private-pay/format";
import { isPrivatePayReportPaymentMethod } from "@/lib/private-pay/constants";
import { createPrivatePayPaymentReport, getInvoiceByPublicToken } from "@/lib/private-pay/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await ctx.params;
  const invoice = await getInvoiceByPublicToken(publicToken);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });
  }

  let body: {
    method?: string;
    amount?: string | number;
    amount_cents?: number;
    reported_date?: string;
    reference?: string;
    note?: string;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  if (!isPrivatePayReportPaymentMethod(body.method)) {
    return NextResponse.json({ ok: false, error: "Choose a valid payment method." }, { status: 400 });
  }

  const amountCents =
    typeof body.amount_cents === "number"
      ? body.amount_cents
      : body.amount != null
        ? dollarsToCents(body.amount)
        : null;

  try {
    const report = await createPrivatePayPaymentReport(invoice.id, {
      method: body.method,
      amountCents,
      reportedDate: body.reported_date ?? null,
      reference: body.reference ?? null,
      customerNote: body.note ?? null,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to submit payment report";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
