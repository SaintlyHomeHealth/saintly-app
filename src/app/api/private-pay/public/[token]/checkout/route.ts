import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceByPublicToken } from "@/lib/private-pay/data";
import { createInvoiceCheckoutSession } from "@/lib/private-pay/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveOrigin(req: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  return req.nextUrl.origin;
}

/**
 * Public, unauthenticated endpoint that creates a Stripe Checkout session for a
 * private-pay invoice identified only by its opaque public token. No PHI is
 * returned. The token is the secret; invalid tokens return 404.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await getInvoiceByPublicToken(token);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const result = await createInvoiceCheckoutSession(invoice, resolveOrigin(req));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
