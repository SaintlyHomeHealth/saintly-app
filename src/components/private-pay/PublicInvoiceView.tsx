import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import {
  formatCentsUsd,
  formatPaymentDetail,
  formatQuantity,
  serviceTypeLabel,
  unitLabelNoun,
} from "@/lib/private-pay/format";
import type { PrivatePayInvoiceWithItems } from "@/lib/private-pay/types";

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  }).format(d);
}

/**
 * HIPAA-safe public invoice view: invoice #, amount, service descriptions only.
 */
export function PublicInvoiceView({
  invoice,
  publicToken,
}: {
  invoice: PrivatePayInvoiceWithItems;
  publicToken: string;
}) {
  const paid = invoice.status === "paid";
  const voided = invoice.status === "void";
  const payment = invoice.payments.find((p) => p.status === "succeeded") ?? invoice.payments[0] ?? null;
  const invoicePdfHref = `/api/private-pay/public/invoice/${publicToken}/pdf`;
  const receiptPdfHref = `/api/private-pay/public/invoice/${publicToken}/receipt`;
  const externalLink = (invoice.external_payment_link ?? "").trim();

  return (
    <main className="flex min-h-screen items-start justify-center bg-gradient-to-b from-sky-50 to-white px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
          <div className="bg-sky-50/80 px-6 py-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
              {PRIVATE_PAY_BUSINESS.legalName}
            </p>
            <h1 className="mt-1 text-lg font-semibold text-slate-900">Private Pay Invoice</h1>
            <p className="mt-1 text-xs text-slate-500">Invoice {invoice.invoice_number}</p>
          </div>

          <div className="px-6 py-6">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {paid ? "Amount paid" : "Amount due"}
              </p>
              <p className="mt-1 text-3xl font-bold text-sky-900">{formatCentsUsd(invoice.total_cents)}</p>
              {paid ? (
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  Paid {formatLongDate(payment?.paid_at ?? invoice.paid_at)}
                </p>
              ) : voided ? (
                <p className="mt-1 text-sm font-semibold text-slate-500">This invoice is no longer payable.</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Due upon receipt</p>
              )}
            </div>

            {(invoice.billing_name ?? "").trim() ? (
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bill to</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{invoice.billing_name}</p>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Service summary</p>
              <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                {invoice.items.map((item) => {
                  const title = (item.description ?? "").trim() || serviceTypeLabel(item.service_type);
                  const detail =
                    item.unit_label === "flat"
                      ? "Flat rate"
                      : `${formatQuantity(item.quantity)} ${unitLabelNoun(item.unit_label, item.quantity)} × ${formatCentsUsd(
                          item.unit_amount_cents
                        )}`;
                  return (
                    <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{title}</p>
                        <p className="text-xs text-slate-500">{detail}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        {formatCentsUsd(item.line_total_cents)}
                      </p>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm font-semibold text-slate-700">Total</p>
                  <p className="text-base font-bold text-sky-900">{formatCentsUsd(invoice.total_cents)}</p>
                </div>
              </div>
            </div>

            {paid ? (
              <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-emerald-800">Payment received — thank you!</p>
                <p className="mt-1 text-xs text-emerald-700">{formatPaymentDetail(payment)}</p>
              </div>
            ) : voided ? null : (
              <div className="mt-6 rounded-2xl border-2 border-sky-200 bg-sky-50/70 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Payment</p>
                <p className="mt-1 text-xs text-slate-600">
                  Payment is due upon receipt. {PRIVATE_PAY_BUSINESS.legalName} will provide a secure payment option
                  separately. If you have already paid or need help, contact Saintly at{" "}
                  <span className="whitespace-nowrap font-semibold text-slate-800">
                    {PRIVATE_PAY_BUSINESS.phoneDisplay}
                  </span>
                  .
                </p>
                {externalLink ? (
                  <a
                    href={externalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
                  >
                    Pay securely
                  </a>
                ) : null}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a
                href={invoicePdfHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                View / download invoice PDF
              </a>
              {paid ? (
                <a
                  href={receiptPdfHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  Download receipt PDF
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          {PRIVATE_PAY_BUSINESS.legalName} · {PRIVATE_PAY_BUSINESS.phoneDisplay} · {PRIVATE_PAY_BUSINESS.email}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-center text-[11px] leading-relaxed text-slate-400">
          This page is for private-pay services only and contains no diagnosis, insurance, Medicare, or clinical
          information.
        </p>
      </div>
    </main>
  );
}
