"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AdminActionButton,
  AdminBadge,
  AdminListCard,
} from "@/components/admin/design-system";
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
import { PrivatePayDeleteInvoiceModal } from "./PrivatePayDeleteInvoiceModal";
import { PrivatePayRecordPaymentModal, type RecordPaymentInput } from "./PrivatePayRecordPaymentModal";
import { PrivatePaySendModal } from "./PrivatePaySendModal";
import {
  hardDeleteInvoice,
  sendInvoice,
  type SendChannel,
} from "./private-pay-client-actions";

const STATUS_VARIANT: Record<PrivatePayInvoiceStatus, "slate" | "amber" | "emerald" | "rose"> = {
  draft: "slate",
  sent: "amber",
  paid: "emerald",
  void: "slate",
  refunded: "rose",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function PrivatePayInvoicePaymentPanel({
  invoice: initialInvoice,
  paymentMethods: initialPaymentMethods,
  pendingReport,
  profileHref,
  contactId,
}: {
  invoice: PrivatePayInvoiceListRow;
  paymentMethods: PrivatePayPaymentMethodOnFile[];
  pendingReport: PrivatePayPaymentReport | null;
  profileHref: string | null;
  contactId: string | null;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods);
  const [rowBusy, setRowBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isOpenStatus = invoice.status === "draft" || invoice.status === "sent";
  const isPaid = invoice.status === "paid" || invoice.status === "refunded";
  const hasCard = paymentMethods.length > 0;
  const defaultCard = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;
  const succeededPayment = invoice.payments.find((p) => p.status === "succeeded") ?? null;
  const hasStripePayment =
    Boolean((invoice.stripe_payment_intent_id ?? "").trim()) ||
    invoice.payments.some((p) => p.status === "succeeded" && (p.stripe_payment_intent_id ?? "").trim());

  const upsert = useCallback(
    (updated: PrivatePayInvoiceWithItems, methods?: PrivatePayPaymentMethodOnFile[]) => {
      const cardMethods = methods ?? paymentMethods;
      setInvoice((prev) => ({
        ...prev,
        ...updated,
        customer_name: prev.customer_name,
        customer_detail: prev.customer_detail,
        profile_href: prev.profile_href,
        pending_payment_report:
          updated.status === "paid" || updated.status === "void" ? null : prev.pending_payment_report,
        has_card_on_file: cardMethods.length > 0,
        payment_badge:
          updated.status === "paid"
            ? "paid"
            : updated.payments.some((p) => p.status === "pending" && p.payment_method === "card")
              ? "processing"
              : updated.payments.some((p) => p.status === "failed" && p.payment_method === "card")
                ? "failed"
                : cardMethods.length > 0
                  ? "card_on_file"
                  : "unpaid",
      }));
    },
    [paymentMethods]
  );

  const handleChargeSuccess = useCallback(
    (payload: {
      invoice: PrivatePayInvoiceWithItems;
      paymentMethods?: PrivatePayPaymentMethodOnFile[];
      message: string;
    }) => {
      const methods = payload.paymentMethods ?? paymentMethods;
      if (payload.paymentMethods) setPaymentMethods(payload.paymentMethods);
      upsert(payload.invoice, methods);
      setChargeOpen(false);
      setBanner({ kind: "ok", text: payload.message });
      router.refresh();
    },
    [upsert, paymentMethods, router]
  );

  const confirmSendInvoice = async (channels: SendChannel[]) => {
    setSendBusy(true);
    setSendError(null);
    try {
      const sentTo: string[] = [];
      let lastInvoice: PrivatePayInvoiceWithItems | null = null;
      for (const channel of channels) {
        const r = await sendInvoice(invoice.id, channel);
        if (r.invoice) lastInvoice = r.invoice;
        if (r.sentTo) sentTo.push(r.sentTo);
      }
      if (lastInvoice) upsert(lastInvoice);
      setSendOpen(false);
      setBanner({
        kind: "ok",
        text: `Invoice sent${sentTo.length ? ` to ${sentTo.join(" and ")}` : ""}.`,
      });
      router.refresh();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSendBusy(false);
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

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await hardDeleteInvoice(invoice.id);
      router.push("/admin/private-pay");
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {banner ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
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

      <AdminListCard hover={false}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Payment status</h2>
            <p className="mt-0.5 text-xs text-slate-500">{invoice.customer_name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminBadge variant={STATUS_VARIANT[invoice.status] ?? "slate"}>
              {PRIVATE_PAY_INVOICE_STATUS_LABELS[invoice.status]}
            </AdminBadge>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${PRIVATE_PAY_PAYMENT_BADGE_STYLES[invoice.payment_badge]}`}
            >
              {PRIVATE_PAY_PAYMENT_BADGE_LABELS[invoice.payment_badge]}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Amount due</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {isPaid ? formatCentsUsd(0) : formatCentsUsd(invoice.total_cents)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Card on file</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-900">
              {defaultCard
                ? formatSavedCardLabel(
                    defaultCard.brand,
                    defaultCard.last4,
                    defaultCard.exp_month,
                    defaultCard.exp_year
                  )
                : "None"}
            </dd>
            {profileHref ? (
              <Link href={profileHref} className="text-xs font-semibold text-sky-800 hover:underline">
                Manage cards on customer profile
              </Link>
            ) : null}
          </div>
          {isPaid ? (
            <>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Paid date</dt>
                <dd className="mt-0.5 text-sm font-semibold text-emerald-900">{formatDateTime(invoice.paid_at)}</dd>
              </div>
              {succeededPayment ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Payment</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-emerald-900">
                    {formatCentsUsd(succeededPayment.amount_cents)}
                    {succeededPayment.card_last4
                      ? ` · ${(succeededPayment.card_brand ?? "Card").toUpperCase()} •••• ${succeededPayment.card_last4}`
                      : ` · ${succeededPayment.payment_method}`}
                  </dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>

        {isOpenStatus ? (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-2">
              <AdminActionButton
                variant="primary"
                size="md"
                disabled={rowBusy}
                onClick={() => {
                  setChargeError(null);
                  setChargeOpen(true);
                }}
              >
                Charge card
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="md"
                disabled={rowBusy}
                onClick={() => {
                  setSendError(null);
                  setSendOpen(true);
                }}
              >
                Send invoice
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="md"
                disabled={rowBusy}
                onClick={() => {
                  setRecordError(null);
                  setRecordOpen(true);
                }}
              >
                Mark paid
              </AdminActionButton>
            </div>
            {!hasCard ? (
              <p className="text-xs text-slate-500">
                Enter the client&apos;s card securely through Stripe to charge this invoice and save the card on file.
                Card numbers are not stored by Saintly.
              </p>
            ) : null}
            {!contactId ? (
              <p className="text-xs text-amber-800">
                This invoice has no linked contact — attach a contact before charging and saving a card.
              </p>
            ) : null}
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

        {!hasStripePayment ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <AdminActionButton
              variant="danger"
              size="md"
              disabled={rowBusy || deleteBusy}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Delete permanently
            </AdminActionButton>
          </div>
        ) : (
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            Invoices with Stripe payments cannot be permanently deleted. Void or archive instead.
          </p>
        )}
      </AdminListCard>

      <PrivatePayChargeCardModal
        open={chargeOpen}
        invoice={invoice}
        paymentMethods={paymentMethods}
        contactId={contactId}
        busy={false}
        error={chargeError}
        onClose={() => {
          setChargeOpen(false);
          setChargeError(null);
        }}
        onSuccess={handleChargeSuccess}
      />

      <PrivatePaySendModal
        open={sendOpen}
        mode="invoice"
        invoiceNumber={invoice.invoice_number}
        email={invoice.billing_email ?? null}
        phone={invoice.billing_phone ?? null}
        busy={sendBusy}
        error={sendError}
        onClose={() => {
          if (sendBusy) return;
          setSendOpen(false);
          setSendError(null);
        }}
        onConfirm={confirmSendInvoice}
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

      <PrivatePayDeleteInvoiceModal
        open={deleteOpen}
        invoiceNumber={invoice.invoice_number}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
