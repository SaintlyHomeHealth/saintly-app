"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PRIVATE_PAY_INVOICE_STATUS_LABELS,
  type PrivatePayInvoiceStatus,
} from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";
import {
  PRIVATE_PAY_PAYMENT_BADGE_LABELS,
  PRIVATE_PAY_PAYMENT_BADGE_STYLES,
  formatSavedCardLabel,
} from "@/lib/private-pay/payment-badges";
import type {
  PrivatePayInvoiceListRow,
  PrivatePayInvoiceWithItems,
  PrivatePayPaymentMethodOnFile,
  PrivatePayPaymentReport,
} from "@/lib/private-pay/types";
import { PrivatePayChargeCardModal } from "./PrivatePayChargeCardModal";
import { PrivatePayRecordPaymentModal, type RecordPaymentInput } from "./PrivatePayRecordPaymentModal";

const STATUS_STYLES: Record<PrivatePayInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  void: "bg-slate-200 text-slate-500",
  refunded: "bg-rose-100 text-rose-900",
};

const actionBtn =
  "rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 whitespace-nowrap";

export function PrivatePayInvoicePaymentPanel({
  invoice: initialInvoice,
  paymentMethods: initialPaymentMethods,
  pendingReport,
  profileHref,
}: {
  invoice: PrivatePayInvoiceListRow;
  paymentMethods: PrivatePayPaymentMethodOnFile[];
  pendingReport: PrivatePayPaymentReport | null;
  profileHref: string | null;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods);
  const [rowBusy, setRowBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  const isOpenStatus = invoice.status === "draft" || invoice.status === "sent";
  const defaultCard = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;

  const upsert = useCallback((updated: PrivatePayInvoiceWithItems) => {
    setInvoice((prev) => ({
      ...prev,
      ...updated,
      customer_name: prev.customer_name,
      customer_detail: prev.customer_detail,
      profile_href: prev.profile_href,
      pending_payment_report:
        updated.status === "paid" || updated.status === "void" ? null : prev.pending_payment_report,
      has_card_on_file: paymentMethods.length > 0,
      payment_badge: updated.status === "paid" ? "paid" : prev.payment_badge,
    }));
  }, [paymentMethods.length]);

  const startCheckout = async () => {
    setRowBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/private-pay/invoices/${invoice.id}/checkout`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) throw new Error(json.error || "Failed to create payment link");
      setPaymentLink(json.url);
      setBanner({ kind: "ok", text: "Secure payment link ready — customer pays themselves." });
      router.refresh();
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setRowBusy(false);
    }
  };

  const submitRecordPayment = async (input: RecordPaymentInput) => {
    setRecordBusy(true);
    setRecordError(null);
    try {
      const res = await fetch(`/api/private-pay/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: input.method,
          reference: input.reference,
          amount: input.amount,
          paid_at: input.paidDate,
          note: input.note,
          customer_note: input.customerNote,
          send_receipt: input.sendReceipt,
          receipt_delivery: input.receiptDelivery,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        invoice?: PrivatePayInvoiceWithItems;
        receiptWarning?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to record payment");
      upsert(json.invoice);
      setRecordOpen(false);
      setBanner({
        kind: json.receiptWarning ? "warn" : "ok",
        text: json.receiptWarning
          ? `Payment recorded. Receipt issue: ${json.receiptWarning}`
          : "Manual payment recorded and invoice marked paid.",
      });
      router.refresh();
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[invoice.status]}`}>
          {PRIVATE_PAY_INVOICE_STATUS_LABELS[invoice.status]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${PRIVATE_PAY_PAYMENT_BADGE_STYLES[invoice.payment_badge]}`}
        >
          {PRIVATE_PAY_PAYMENT_BADGE_LABELS[invoice.payment_badge]}
        </span>
      </div>

      {banner ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : banner.kind === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Payment</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Amount due</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {invoice.status === "paid" ? formatCentsUsd(0) : formatCentsUsd(invoice.total_cents)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Card on file</p>
            <p className="mt-0.5 text-sm text-slate-800">
              {defaultCard
                ? formatSavedCardLabel(
                    defaultCard.brand,
                    defaultCard.last4,
                    defaultCard.exp_month,
                    defaultCard.exp_year
                  )
                : "None"}
            </p>
            {profileHref ? (
              <Link href={profileHref} className="text-xs font-semibold text-sky-800 hover:underline">
                Manage cards on customer profile
              </Link>
            ) : null}
          </div>
        </div>

        {isOpenStatus ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={rowBusy || paymentMethods.length === 0}
              onClick={() => {
                setChargeError(null);
                setChargeOpen(true);
              }}
              className={`${actionBtn} border-sky-600 bg-sky-600 text-white hover:bg-sky-700`}
            >
              Charge card
            </button>
            <button
              type="button"
              disabled={rowBusy}
              onClick={() => startCheckout()}
              className={`${actionBtn} border-sky-300 bg-white text-sky-800 hover:bg-sky-50`}
            >
              Send payment link
            </button>
            <button
              type="button"
              disabled={rowBusy}
              onClick={() => {
                setRecordError(null);
                setRecordOpen(true);
              }}
              className={`${actionBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Record manual payment
            </button>
          </div>
        ) : null}

        {paymentLink ? (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <input readOnly value={paymentLink} className="mt-1 w-full rounded border border-sky-200 bg-white px-2 py-1" />
          </div>
        ) : null}

        {invoice.payments.some((p) => p.status === "failed" && p.payment_method === "card") ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            <p className="font-semibold">Recent card charge failed</p>
            {invoice.payments
              .filter((p) => p.status === "failed" && p.payment_method === "card")
              .slice(0, 1)
              .map((p) => (
                <p key={p.id} className="mt-1">{p.failure_message ?? "Card declined."}</p>
              ))}
          </div>
        ) : null}
      </div>

      <PrivatePayChargeCardModal
        open={chargeOpen}
        invoice={invoice}
        paymentMethods={paymentMethods}
        busy={chargeBusy}
        error={chargeError}
        onClose={() => {
          if (chargeBusy) return;
          setChargeOpen(false);
          setChargeError(null);
        }}
        onSuccess={(updated, message) => {
          upsert(updated);
          setChargeOpen(false);
          setBanner({ kind: "ok", text: message });
          router.refresh();
        }}
      />

      <PrivatePayRecordPaymentModal
        open={recordOpen}
        invoiceNumber={invoice.invoice_number}
        totalCents={invoice.total_cents}
        pendingReport={pendingReport}
        busy={recordBusy}
        error={recordError}
        onClose={() => {
          if (recordBusy) return;
          setRecordOpen(false);
          setRecordError(null);
        }}
        onSubmit={submitRecordPayment}
      />
    </div>
  );
}
