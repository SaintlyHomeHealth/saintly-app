import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, markInvoicePaidManually } from "@/lib/private-pay/data";
import { isPrivatePayManualPaymentMethod } from "@/lib/private-pay/constants";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { dollarsToCents } from "@/lib/private-pay/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: {
    method?: string;
    amount?: string | number;
    amount_cents?: number;
    paid_at?: string;
    reference?: string;
    note?: string;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  // Card payments must flow through Stripe so we capture brand/last4 safely; only
  // manual methods (Zelle, Cash App, Apple Cash, cash, check, other) can be hand-recorded.
  if (!isPrivatePayManualPaymentMethod(body.method)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Choose a manual payment method (Zelle, Cash App, Apple Cash, Cash, Check, or Other). Use the secure link for card payments.",
      },
      { status: 400 }
    );
  }
  const method = body.method;

  const amountCents =
    typeof body.amount_cents === "number"
      ? body.amount_cents
      : body.amount != null
        ? dollarsToCents(body.amount)
        : undefined;

  try {
    await markInvoicePaidManually(
      invoiceId,
      {
        method,
        amountCents,
        paidAt: body.paid_at ?? null,
        reference: body.reference ?? null,
        note: body.note ?? null,
      },
      auth.auth.user.id
    );
    const invoice = await getInvoiceWithItems(invoiceId);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to mark paid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
