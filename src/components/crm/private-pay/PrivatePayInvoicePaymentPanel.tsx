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
import { formatCentsUsd, formatPaymentDetail } from "@/lib/private-pay/format";
import {
  PRIVATE_PAY_PAYMENT_BADGE_LABELS,
  PRIVATE_PAY_PAYMENT_BADGE_STYLES,
} from "@/lib/private-pay/payment-badges";
import type {
  PrivatePayInvoiceListRow,
  PrivatePayInvoiceWithItems,
  PrivatePayPaymentReport,
} from "@/lib/private-pay/types";
import { PrivatePayDeleteInvoiceModal } from "./PrivatePayDeleteInvoiceModal";
import { PrivatePayRecordPaymentModal } from "./PrivatePayRecordPaymentModal";
import type { RecordPaymentPayload } from "./private-pay-client-actions";
import { PrivatePaySendModal } from "./PrivatePaySendModal";
import { hardDeleteInvoice, sendInvoice, sendReceipt, type SendChannel } from "./private-pay-client-actions";

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

function invoiceHasProtectedPayment(invoice: PrivatePayInvoiceListRow): boolean {
  return (
    Boolean((invoice.stripe_payment_intent_id ?? "").trim()) ||
    invoice.payments.some((p) => p.status === "succeeded" && (p.stripe_payment_intent_id ?? "").trim())
  );
}

export function PrivatePayInvoicePaymentPanel({
  invoice: initialInvoice,
  pendingReport,
  profileHref,
}: {
  invoice: PrivatePayInvoiceListRow;
  pendingReport: PrivatePayPaymentReport | null;
  profileHref: string | null;
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initialInvoice);
  const [rowBusy, setRowBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendMode, setSendMode] = useState<"invoice" | "receipt">("invoice");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isOpenStatus = invoice.status === "draft" || invoice.status === "sent";
  const isPaid = invoice.status === "paid" || invoice.status === "refunded";
  const succeededPayment = invoice.payments.find((p) => p.status === "succeeded") ?? null;
  const canHardDelete = !invoiceHasProtectedPayment(invoice);

  const upsert = useCallback((updated: PrivatePayInvoiceWithItems) => {
    setInvoice((prev) => ({
      ...prev,
      ...updated,
      customer_name: prev.customer_name,
      customer_detail: prev.customer_detail,
      profile_href: prev.profile_href,
      pending_payment_report:
        updated.status === "paid" || updated.status === "void" ? null : prev.pending_payment_report,
      has_card_on_file: false,
      payment_badge: updated.status === "paid" ? "paid" : "unpaid",
    }));
  }, []);

  const confirmSendInvoice = async (channels: SendChannel[]) => {
    setSendBusy(true);
    setSendError(null);
    try {
      const sentTo: string[] = [];
      let lastInvoice: PrivatePayInvoiceWithItems | null = null;
      for (const channel of channels) {
        if (sendMode === "invoice") {
          const r = await sendInvoice(invoice.id, channel);
          if (r.invoice) lastInvoice = r.invoice;
          if (r.sentTo) sentTo.push(r.sentTo);
        } else {
          const r = await sendReceipt(invoice.id, channel);
          if (r.sentTo) sentTo.push(r.sentTo);
        }
      }
      if (lastInvoice) upsert(lastInvoice);
      setSendOpen(false);
      const label = sendMode === "invoice" ? "Invoice" : "Receipt";
      setBanner({
        kind: "ok",
        text: `${label} sent${sentTo.length ? ` to ${sentTo.join(" and ")}` : ""}.`,
      });
      router.refresh();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSendBusy(false);
    }
  };

  const submitRecordPayment = async (input: RecordPaymentPayload) => {
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
          : "Payment recorded and invoice marked paid.",
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
            {profileHref ? (
              <Link href={profileHref} className="text-xs font-semibold text-sky-800 hover:underline">
                View customer profile
              </Link>
            ) : null}
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
          {isPaid ? (
            <>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Paid date</dt>
                <dd className="mt-0.5 text-sm font-semibold text-emerald-900">{formatDateTime(invoice.paid_at)}</dd>
              </div>
              {succeededPayment ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Payment</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-emerald-900">
                    {formatCentsUsd(succeededPayment.amount_cents)} · {formatPaymentDetail(succeededPayment)}
                  </dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {isOpenStatus ? (
            <>
              <AdminActionButton
                variant="primary"
                size="md"
                disabled={rowBusy}
                onClick={() => {
                  setSendError(null);
                  setSendMode("invoice");
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
            </>
          ) : isPaid ? (
            <>
              <AdminActionButton variant="primary" size="md" href={`/api/private-pay/invoices/${invoice.id}/receipt`}>
                Receipt PDF
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                size="md"
                disabled={rowBusy}
                onClick={() => {
                  setSendError(null);
                  setSendMode("receipt");
                  setSendOpen(true);
                }}
              >
                Send receipt
              </AdminActionButton>
            </>
          ) : null}
        </div>

        {canHardDelete ? (
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
            This invoice cannot be permanently deleted because it has a processed card payment on record.
          </p>
        )}
      </AdminListCard>

      <PrivatePaySendModal
        open={sendOpen}
        mode={sendMode}
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
