import { NextResponse, type NextRequest } from "next/server";

import { listPaymentMethodsForContact } from "@/lib/private-pay/customers";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> }
) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { contactId } = await ctx.params;
  const methods = await listPaymentMethodsForContact(contactId);
  return NextResponse.json({ ok: true, paymentMethods: methods });
}
