import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl, getAppBaseUrlEnvWarning, validateAppBaseUrl } from "@/lib/app-url";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { getInvoiceWithItems } from "@/lib/private-pay/data";
import { buildPrivatePayDeliveryLinks } from "@/lib/private-pay/public-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns canonical outbound links for admin preview (SMS, email, copy). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { invoiceId } = await ctx.params;
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const baseUrl = getAppBaseUrl(req.nextUrl.origin);
  const urlError = validateAppBaseUrl(baseUrl);
  if (urlError) {
    return NextResponse.json({ ok: false, error: urlError }, { status: 500 });
  }

  const links = buildPrivatePayDeliveryLinks(invoice.public_token, invoice.status, baseUrl);
  const envWarning = getAppBaseUrlEnvWarning();

  return NextResponse.json({
    ok: true,
    invoiceNumber: invoice.invoice_number,
    baseUrl,
    envWarning,
    ...links,
  });
}
