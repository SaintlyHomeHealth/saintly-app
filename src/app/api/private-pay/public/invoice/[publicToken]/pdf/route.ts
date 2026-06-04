import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceByPublicToken } from "@/lib/private-pay/data";
import { generatePrivatePayInvoicePdf } from "@/lib/private-pay/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public invoice PDF, addressable only by the opaque public token. No admin
 * login, no sequential IDs, no PHI. Opens inline by default (downloadable).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await ctx.params;
  const invoice = await getInvoiceByPublicToken(publicToken);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }

  const pdfBytes = await generatePrivatePayInvoicePdf(invoice);
  const download = req.nextUrl.searchParams.get("download") === "1";
  const filename = `Saintly_Invoice_${invoice.invoice_number}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
