"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge } from "@/components/admin/design-system";
import { PRIVATE_PAY_INVOICE_STATUS_LABELS } from "@/lib/private-pay/constants";
import { formatCentsUsd } from "@/lib/private-pay/format";
import type {
  PrivatePayInvoiceWithItems,
  PrivatePayPaymentMethodOnFile,
} from "@/lib/private-pay/types";
import { PrivatePayChargeCardModal } from "./PrivatePayChargeCardModal";
import { PrivatePayRecordPaymentModal } from "./PrivatePayRecordPaymentModal";
import { PrivatePaySendModal } from "./PrivatePaySendModal";
import {
  loadPaymentMethods,
  recordManualPayment,
  sendInvoice,
  type RecordPaymentPayload,
  type SendChannel,
} from "./private-pay-client-actions";

export type PrivatePayContactBillingSummary = {
  unpaidCount: number;
  unpaidTotalCents: number;
  mostRecent: {
    invoice_number: string;
    total_cents: number;
    status: string;
    created_at: string;
  } | null;
  lastPaymentAt: string | null;
};

const btnPrimary =
  "inline-flex items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";
const btnGhost =
  "inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

export function PrivatePayContactBillingCard({
  contactId,
  canManage,
  hasCard,
  contactHasPhone,
  summary,
  openInvoice,
}: {
  contactId: string;
  canManage: boolean;
  hasCard: boolean;
  contactHasPhone: boolean;
  summary: PrivatePayContactBillingSummary;
  /** Most recent unpaid invoice, used as the target for quick actions. */
  openInvoice: PrivatePayInvoiceWithItems | null;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeMethods, setChargeMethods] = useState<PrivatePayPaymentMethodOnFile[]>([]);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const hasOpenInvoice = Boolean(openInvoice);

  const openCharge = async () => {
    if (!openInvoice) return;
    setBusy(true);
    setBanner(null);
    try {
      const methods = await loadPaymentMethods(contactId);
      setChargeMethods(methods);
      setChargeOpen(true);
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  const confirmSend = async (channels: SendChannel[]) => {
    if (!openInvoice) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const sentTo: string[] = [];
      for (const channel of channels) {
        const r = await sendInvoice(openInvoice.id, channel);
        if (r.sentTo) sentTo.push(r.sentTo);
      }
      setSendOpen(false);
      setBanner({ kind: "ok", text: `Invoice sent${sentTo.length ? ` to ${sentTo.join(" and ")}` : ""}.` });
      router.refresh();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSendBusy(false);
    }
  };

  const submitRecord = async (payload: RecordPaymentPayload) => {
    if (!openInvoice) return;
    setRecordBusy(true);
    setRecordError(null);
    try {
      const { receiptWarning } = await recordManualPayment(openInvoice.id, payload);
      setRecordOpen(false);
      setBanner({
        kind: receiptWarning ? "warn" : "ok",
        text: receiptWarning
          ? `Payment recorded. Receipt delivery issue: ${receiptWarning}`
          : "Payment recorded and invoice marked paid.",
      });
      router.refresh();
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRecordBusy(false);
    }
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Private Pay Billing</h2>
          <p className="mt-1 text-xs text-slate-500">
            Charge a saved card, send an invoice, or record a private-pay payment for this contact.
          </p>
        </div>
        {hasCard ? (
          <AdminBadge variant="sky">Card on file</AdminBadge>
        ) : (
          <AdminBadge variant="slate">No card on file</AdminBadge>
        )}
      </div>

      {banner ? (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
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

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Card on file</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{hasCard ? "Yes" : "No"}</dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unpaid total</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900 tabular-nums">
            {formatCentsUsd(summary.unpaidTotalCents)}
            {summary.unpaidCount > 0 ? (
              <span className="ml-1 text-[11px] font-medium text-slate-500">
                ({summary.unpaidCount} open)
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Most recent invoice</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">
            {summary.mostRecent ? (
              <>
                {summary.mostRecent.invoice_number}{" "}
                <span className="text-[11px] font-medium text-slate-500">
                  {formatCentsUsd(summary.mostRecent.total_cents)} ·{" "}
                  {PRIVATE_PAY_INVOICE_STATUS_LABELS[
                    summary.mostRecent.status as keyof typeof PRIVATE_PAY_INVOICE_STATUS_LABELS
                  ] ?? summary.mostRecent.status}
                </span>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last payment</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{formatDate(summary.lastPaymentAt)}</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy || !hasOpenInvoice} onClick={openCharge} className={btnPrimary}>
            Charge card
          </button>
          <button
            type="button"
            disabled={busy || !hasOpenInvoice}
            onClick={() => {
              setSendError(null);
              setSendOpen(true);
            }}
            className={btnGhost}
          >
            Send invoice
          </button>
          <button
            type="button"
            disabled={busy || !hasOpenInvoice}
            onClick={() => {
              setRecordError(null);
              setRecordOpen(true);
            }}
            className={btnGhost}
          >
            Mark paid
          </button>
          <Link href="/admin/private-pay" className={btnGhost}>
            New invoice
          </Link>
        </div>
      ) : null}

      {canManage && !hasCard && hasOpenInvoice ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Enter the client&apos;s card securely through Stripe to charge this invoice and save the card on file. Card
          numbers are not stored by Saintly.
        </p>
      ) : null}

      {!hasOpenInvoice && canManage ? (
        <p className="mt-2 text-[11px] text-slate-500">
          No open invoice for this contact. Create one from{" "}
          <Link href="/admin/private-pay" className="font-semibold text-sky-800 hover:underline">
            Private Pay Billing
          </Link>
          .
        </p>
      ) : null}

      <PrivatePayChargeCardModal
        open={chargeOpen}
        invoice={openInvoice}
        paymentMethods={chargeMethods}
        contactId={contactId}
        busy={false}
        error={null}
        onClose={() => setChargeOpen(false)}
        onSuccess={(payload) => {
          setChargeOpen(false);
          setBanner({ kind: "ok", text: payload.message });
          router.refresh();
        }}
      />

      <PrivatePaySendModal
        open={sendOpen}
        mode="invoice"
        invoiceNumber={openInvoice?.invoice_number ?? ""}
        email={openInvoice?.billing_email ?? null}
        phone={openInvoice?.billing_phone ?? null}
        busy={sendBusy}
        error={sendError}
        onClose={() => {
          if (sendBusy) return;
          setSendOpen(false);
          setSendError(null);
        }}
        onConfirm={confirmSend}
      />

      <PrivatePayRecordPaymentModal
        open={recordOpen}
        invoiceNumber={openInvoice?.invoice_number ?? ""}
        totalCents={openInvoice?.total_cents ?? 0}
        pendingReport={null}
        busy={recordBusy}
        error={recordError}
        onClose={() => {
          if (recordBusy) return;
          setRecordOpen(false);
          setRecordError(null);
        }}
        onSubmit={submitRecord}
      />
    </div>
  );
}
