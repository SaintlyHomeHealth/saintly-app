import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { attachCheckoutSession, getInvoiceWithItems } from "@/lib/private-pay/data";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { getStripe } from "@/lib/private-pay/stripe";
import { serviceTypeLabel } from "@/lib/private-pay/format";
import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "Stripe is not configured. Set STRIPE_SECRET_KEY." },
      { status: 503 }
    );
  }

  const { invoiceId } = await ctx.params;
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ ok: false, error: "Invoice is already paid" }, { status: 400 });
  }
  if (invoice.total_cents <= 0) {
    return NextResponse.json({ ok: false, error: "Invoice total must be greater than $0" }, { status: 400 });
  }

  const origin = resolveOrigin(req);
  const simple = invoice.discount_cents === 0 && invoice.tax_cents === 0;

  // Itemize when there is no discount/tax (sum equals total exactly); otherwise a single
  // combined line so the charged amount always matches the invoice total.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = simple
    ? invoice.items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: item.line_total_cents,
          product_data: {
            name: (item.description ?? "").trim() || serviceTypeLabel(item.service_type),
          },
        },
      }))
    : [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: invoice.total_cents,
            product_data: { name: `${PRIVATE_PAY_BUSINESS.legalName} — Invoice ${invoice.invoice_number}` },
          },
        },
      ];

  const metadata: Record<string, string> = {
    private_pay_invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: (invoice.billing_email ?? "").trim() || undefined,
      client_reference_id: invoice.id,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/private-pay/thank-you?invoice=${encodeURIComponent(invoice.invoice_number)}`,
      cancel_url: `${origin}/private-pay/thank-you?status=cancelled&invoice=${encodeURIComponent(
        invoice.invoice_number
      )}`,
    });

    if (!session.url) {
      return NextResponse.json({ ok: false, error: "Stripe did not return a checkout URL" }, { status: 502 });
    }

    await attachCheckoutSession(invoice.id, {
      sessionId: session.id,
      customerId: typeof session.customer === "string" ? session.customer : null,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create checkout session";
    console.error("[private-pay] checkout error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
