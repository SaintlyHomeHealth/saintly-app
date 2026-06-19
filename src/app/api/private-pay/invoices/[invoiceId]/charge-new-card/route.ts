import { NextResponse, type NextRequest } from "next/server";

import { chargeInvoiceWithNewPaymentMethod, finalizeNewCardCharge } from "@/lib/private-pay/charge-new-card";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { invoiceId } = await ctx.params;
  let body: {
    stripe_payment_method_id?: string;
    payment_intent_id?: string;
    consent_authorized?: boolean;
    finalize?: boolean;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  if (body.finalize) {
    const paymentIntentId = (body.payment_intent_id ?? "").trim();
    if (!paymentIntentId) {
      return NextResponse.json({ ok: false, error: "Missing payment intent." }, { status: 400 });
    }
    const result = await finalizeNewCardCharge(invoiceId, paymentIntentId, auth.auth.user.id);
    if (result.ok && result.status === "succeeded") {
      return NextResponse.json({
        ok: true,
        status: "succeeded",
        invoice: result.invoice,
        paymentMethods: result.paymentMethods,
        message: result.message,
        last4: result.last4,
      });
    }
    if (!result.ok && result.status === "requires_action") {
      return NextResponse.json({
        ok: false,
        status: "requires_action",
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        error: result.message,
      });
    }
    return NextResponse.json({
      ok: false,
      status: "failed",
      error: result.message,
      paymentIntentId: result.paymentIntentId,
    });
  }

  const stripePaymentMethodId = (body.stripe_payment_method_id ?? "").trim();
  if (!stripePaymentMethodId) {
    return NextResponse.json({ ok: false, error: "Missing payment method." }, { status: 400 });
  }

  const result = await chargeInvoiceWithNewPaymentMethod(
    invoiceId,
    stripePaymentMethodId,
    auth.auth.user.id,
    { consentAuthorized: body.consent_authorized === true }
  );

  if (result.ok && result.status === "succeeded") {
    return NextResponse.json({
      ok: true,
      status: "succeeded",
      invoice: result.invoice,
      paymentMethods: result.paymentMethods,
      message: result.message,
      last4: result.last4,
    });
  }

  if (!result.ok && result.status === "requires_action") {
    return NextResponse.json({
      ok: false,
      status: "requires_action",
      paymentIntentId: result.paymentIntentId,
      clientSecret: result.clientSecret,
      error: result.message,
    });
  }

  return NextResponse.json({
    ok: false,
    status: "failed",
    error: result.message,
    paymentIntentId: result.paymentIntentId,
  });
}
