import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { chargeInvoiceSavedCard } from "@/lib/private-pay/charge-card";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { getInvoiceWithItems } from "@/lib/private-pay/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { invoiceId } = await ctx.params;
  let body: { payment_method_id?: string } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const paymentMethodId = (body.payment_method_id ?? "").trim();
  if (!paymentMethodId) {
    return NextResponse.json({ ok: false, error: "Select a saved card." }, { status: 400 });
  }

  const result = await chargeInvoiceSavedCard(
    invoiceId,
    paymentMethodId,
    auth.auth.user.id,
    getAppBaseUrl(req.nextUrl.origin)
  );

  if (result.ok && result.status === "succeeded") {
    const invoice = await getInvoiceWithItems(invoiceId);
    return NextResponse.json({
      ok: true,
      status: "succeeded",
      invoice,
      last4: result.last4,
      message: `Card charged successfully ending in ${result.last4 ?? "****"}.`,
    });
  }

  if (!result.ok && result.status === "requires_action") {
    return NextResponse.json({
      ok: false,
      status: "requires_action",
      paymentIntentId: result.paymentIntentId,
      authUrl: result.authUrl,
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
