import { NextResponse, type NextRequest } from "next/server";

import { getInvoiceWithItems } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { generatePrivatePayReceiptPdf } from "@/lib/private-pay/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (invoice.status !== "paid") {
    return NextResponse.json({ ok: false, error: "Receipt is available only after payment" }, { status: 400 });
  }

  const pdfBytes = await generatePrivatePayReceiptPdf(invoice);
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const filename = `Receipt_${invoice.invoice_number}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
