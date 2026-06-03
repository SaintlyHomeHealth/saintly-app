import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, markInvoicePaidManually } from "@/lib/private-pay/data";
import { isPrivatePayPaymentMethod } from "@/lib/private-pay/constants";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: { method?: string; amount_cents?: number; note?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const method = isPrivatePayPaymentMethod(body.method) ? body.method : "manual";
  if (method === "card") {
    // Card payments must flow through Stripe so we capture brand/last4 safely.
    return NextResponse.json(
      { ok: false, error: "Use Charge Card / Send Payment Link for card payments." },
      { status: 400 }
    );
  }

  try {
    await markInvoicePaidManually(
      invoiceId,
      { method, amountCents: body.amount_cents, note: body.note ?? null },
      auth.auth.user.id
    );
    const invoice = await getInvoiceWithItems(invoiceId);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to mark paid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
