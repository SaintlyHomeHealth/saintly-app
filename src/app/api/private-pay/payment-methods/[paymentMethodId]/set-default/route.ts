import { NextResponse, type NextRequest } from "next/server";

import { setDefaultPaymentMethod } from "@/lib/private-pay/customers";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ paymentMethodId: string }> }
) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { paymentMethodId } = await ctx.params;
  try {
    const method = await setDefaultPaymentMethod(paymentMethodId);
    return NextResponse.json({ ok: true, paymentMethod: method });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to set default card";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
