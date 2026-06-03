import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems, updateDraftInvoice } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import type { PrivatePayInvoiceInput } from "@/lib/private-pay/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, invoice });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: PrivatePayInvoiceInput;
  try {
    body = (await req.json()) as PrivatePayInvoiceInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const invoice = await updateDraftInvoice(invoiceId, body);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update invoice";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
