import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { getInvoiceByPublicToken } from "@/lib/private-pay/data";
import { createInvoiceCheckoutSession } from "@/lib/private-pay/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await getInvoiceByPublicToken(token);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const result = await createInvoiceCheckoutSession(invoice, getAppBaseUrl(req.nextUrl.origin));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
