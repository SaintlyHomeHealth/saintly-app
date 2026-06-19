import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl, validateAppBaseUrl } from "@/lib/app-url";
import { getInvoiceWithItems, markInvoicePaidManually } from "@/lib/private-pay/data";
import { deliverPrivatePayReceipt, type PrivatePayReceiptDelivery } from "@/lib/private-pay/deliver-receipt";
import { isPrivatePayStaffRecordedPaymentMethod } from "@/lib/private-pay/constants";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { dollarsToCents } from "@/lib/private-pay/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isReceiptDelivery(value: unknown): value is PrivatePayReceiptDelivery {
  return value === "text" || value === "email" || value === "both";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { invoiceId } = await ctx.params;

  let body: {
    method?: string;
    amount?: string | number;
    amount_cents?: number;
    paid_at?: string;
    reference?: string;
    note?: string;
    customer_note?: string;
    send_receipt?: boolean;
    receipt_delivery?: string;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  if (!isPrivatePayStaffRecordedPaymentMethod(body.method)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose a payment method (Square, Cash, Check, Bank Transfer, Other, or Custom).",
      },
      { status: 400 }
    );
  }
  const method = body.method;

  const amountCents =
    typeof body.amount_cents === "number"
      ? body.amount_cents
      : body.amount != null
        ? dollarsToCents(body.amount)
        : undefined;

  const noteParts: string[] = [];
  const internal = (body.note ?? "").trim();
  const customer = (body.customer_note ?? "").trim();
  if (internal) noteParts.push(internal);
  if (customer) noteParts.push(`Customer note: ${customer}`);
  const combinedNote = noteParts.length ? noteParts.join("\n\n") : null;

  try {
    await markInvoicePaidManually(
      invoiceId,
      {
        method,
        amountCents,
        paidAt: body.paid_at ?? null,
        reference: body.reference ?? null,
        note: combinedNote,
      },
      auth.auth.user.id
    );
    const invoice = await getInvoiceWithItems(invoiceId);
    if (!invoice) {
      return NextResponse.json({ ok: false, error: "Invoice not found after payment." }, { status: 500 });
    }

    const sendReceipt = body.send_receipt === true;
    let receiptWarning: string | null = null;
    if (sendReceipt) {
      const delivery = isReceiptDelivery(body.receipt_delivery) ? body.receipt_delivery : "both";
      const baseUrl = getAppBaseUrl(req.nextUrl.origin);
      const urlError = validateAppBaseUrl(baseUrl);
      if (urlError) {
        receiptWarning = urlError;
      } else {
        const sent = await deliverPrivatePayReceipt({ invoice, baseUrl, delivery });
        if (!sent.ok) receiptWarning = sent.error;
      }
    }

    return NextResponse.json({ ok: true, invoice, receiptWarning });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to mark paid";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
