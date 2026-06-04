import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import {
  formatCentsUsd,
  formatPaymentDetail,
  formatQuantity,
  serviceTypeLabel,
  unitLabelNoun,
} from "@/lib/private-pay/format";
import type { PrivatePayPaymentSettings } from "@/lib/private-pay/payment-settings";
import type { PrivatePayInvoiceWithItems, PrivatePayPaymentReport } from "@/lib/private-pay/types";
import { PayButton } from "@/app/private-pay/pay/[token]/PayButton";
import { PaymentReportForm } from "./PaymentReportForm";

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

function formatReportDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
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
  settings,
  pendingReport,
}: {
  invoice: PrivatePayInvoiceWithItems;
  publicToken: string;
  settings: PrivatePayPaymentSettings;
  pendingReport: PrivatePayPaymentReport | null;
}) {
  const paid = invoice.status === "paid";
  const voided = invoice.status === "void";
  const payment = invoice.payments.find((p) => p.status === "succeeded") ?? invoice.payments[0] ?? null;
  const invoicePdfHref = `/api/private-pay/public/invoice/${publicToken}/pdf`;
  const receiptPdfHref = `/api/private-pay/public/invoice/${publicToken}/receipt`;
  const defaultAmount = (invoice.total_cents / 100).toFixed(2);

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
              <>
                {settings.showZelle ? (
                  <div className="mt-6 rounded-2xl border-2 border-sky-200 bg-sky-50/70 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Preferred payment: Zelle</p>
                    <p className="mt-2 text-sm font-medium text-slate-800">Send to:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                      {settings.zelle.sendToLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-slate-600">
                      Memo: Invoice <span className="font-semibold">{invoice.invoice_number}</span>
                    </p>
                  </div>
                ) : null}

                {settings.showCashApp || settings.showAppleCash || settings.showCashCheck ? (
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other options</p>
                    <dl className="mt-2 space-y-2 text-sm">
                      {settings.showCashApp && settings.cashApp.display ? (
                        <div>
                          <dt className="font-semibold text-slate-700">Cash App</dt>
                          <dd className="text-slate-600">{settings.cashApp.display}</dd>
                        </div>
                      ) : null}
                      {settings.showAppleCash && settings.appleCash.sendToLines.length ? (
                        <div>
                          <dt className="font-semibold text-slate-700">Apple Cash</dt>
                          <dd className="text-slate-600">{settings.appleCash.sendToLines.join(" · ")}</dd>
                        </div>
                      ) : null}
                      {settings.showCashCheck ? (
                        <div>
                          <dt className="font-semibold text-slate-700">Cash / check</dt>
                          <dd className="text-slate-600">
                            Contact {settings.contactLine} to arrange payment.
                            {settings.check.payableTo ? (
                              <span className="block text-xs text-slate-500">
                                Checks payable to {settings.check.payableTo}
                                {settings.check.mailingAddress ? ` · Mail to ${settings.check.mailingAddress}` : ""}
                              </span>
                            ) : null}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {settings.manualNote ? (
                      <p className="mt-2 text-xs text-slate-500">{settings.manualNote}</p>
                    ) : null}
                  </div>
                ) : null}

                {pendingReport ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    We received your payment report on {formatReportDate(pendingReport.reported_date)}. Saintly
                    will verify and send your receipt.
                  </div>
                ) : (
                  <PaymentReportForm publicToken={publicToken} defaultAmount={defaultAmount} />
                )}

                {settings.showStripe ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-sm font-medium text-slate-700">Prefer to pay by card?</p>
                    <p className="mt-1 text-xs text-slate-500">Pay by card / Apple Pay securely</p>
                    <PayButton token={publicToken} />
                    <p className="mt-2 text-[11px] text-slate-400">
                      Note: card payments may include processing fees if we decide to add that later.
                    </p>
                  </div>
                ) : null}
              </>
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
