import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, voidInvoice } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  try {
    await voidInvoice(invoiceId);
    const invoice = await getInvoiceWithItems(invoiceId);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to void invoice";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
