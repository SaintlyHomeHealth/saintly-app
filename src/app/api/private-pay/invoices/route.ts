import { NextResponse, type NextRequest } from "next/server";

import { createInvoiceWithItems } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import type { PrivatePayInvoiceInput } from "@/lib/private-pay/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: PrivatePayInvoiceInput;
  try {
    body = (await req.json()) as PrivatePayInvoiceInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ ok: false, error: "items is required" }, { status: 400 });
  }

  try {
    const invoice = await createInvoiceWithItems(body, auth.auth.user.id);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create invoice";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
