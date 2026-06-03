"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PRIVATE_PAY_INVOICE_STATUS_LABELS,
  type PrivatePayInvoiceStatus,
} from "@/lib/private-pay/constants";
import { formatCentsUsd, serviceTypeLabel } from "@/lib/private-pay/format";
import type {
  PrivatePayInvoiceInput,
  PrivatePayInvoiceWithItems,
  PrivatePayServiceTemplate,
} from "@/lib/private-pay/types";
import { PrivatePayInvoiceModal, type InvoiceSubmitAction } from "./PrivatePayInvoiceModal";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

const STATUS_STYLES: Record<PrivatePayInvoiceStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-amber-100 text-amber-900",
  paid: "bg-emerald-100 text-emerald-900",
  void: "bg-slate-200 text-slate-500",
  refunded: "bg-rose-100 text-rose-900",
};

function servicesSummary(invoice: PrivatePayInvoiceWithItems): string {
  const labels = invoice.items.map((i) => (i.description ?? "").trim() || serviceTypeLabel(i.service_type));
  if (labels.length === 0) return "—";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;
}

export function PrivatePaySection({
  contactId,
  patientId,
  leadId,
  defaultBilling,
  templates,
  initialInvoices,
}: {
  contactId: string | null;
  patientId?: string | null;
  leadId?: string | null;
  defaultBilling: { name?: string; email?: string; phone?: string; address?: string };
  templates: PrivatePayServiceTemplate[];
  initialInvoices: PrivatePayInvoiceWithItems[];
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<PrivatePayInvoiceWithItems[]>(initialInvoices);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PrivatePayInvoiceWithItems | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [paymentLink, setPaymentLink] = useState<{ invoiceNumber: string; url: string } | null>(null);

  const upsertInvoice = useCallback((invoice: PrivatePayInvoiceWithItems) => {
    setInvoices((prev) => {
      const exists = prev.some((i) => i.id === invoice.id);
      return exists ? prev.map((i) => (i.id === invoice.id ? invoice : i)) : [invoice, ...prev];
    });
  }, []);

  const startCheckout = useCallback(
    async (invoiceId: string, action: "link" | "charge") => {
      const res = await fetch(`/api/private-pay/invoices/${invoiceId}/checkout`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        throw new Error(json.error || "Failed to create checkout session");
      }
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (invoice) upsertInvoice({ ...invoice, status: "sent" });
      if (action === "charge") {
        window.open(json.url, "_blank", "noopener,noreferrer");
        setBanner({ kind: "ok", text: "Stripe checkout opened in a new tab for card entry." });
      } else {
        setPaymentLink({ invoiceNumber: invoice?.invoice_number ?? "", url: json.url });
      }
      router.refresh();
    },
    [invoices, router, upsertInvoice]
  );

  const handleSubmit = useCallback(
    async (action: InvoiceSubmitAction, input: PrivatePayInvoiceInput) => {
      setBusy(true);
      setModalError(null);
      try {
        const payload: PrivatePayInvoiceInput = {
          ...input,
          contact_id: contactId,
          patient_id: patientId ?? null,
          lead_id: leadId ?? null,
        };
        const isEdit = Boolean(editing);
        const res = await fetch(
          isEdit ? `/api/private-pay/invoices/${editing!.id}` : "/api/private-pay/invoices",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          invoice?: PrivatePayInvoiceWithItems;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.invoice) {
          throw new Error(json.error || "Failed to save invoice");
        }
        upsertInvoice(json.invoice);
        const invoiceId = json.invoice.id;
        setModalOpen(false);
        setEditing(null);
        if (action === "link" || action === "charge") {
          await startCheckout(invoiceId, action);
        } else {
          setBanner({ kind: "ok", text: `Draft invoice ${json.invoice.invoice_number} saved.` });
        }
        router.refresh();
      } catch (e) {
        setModalError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [contactId, patientId, leadId, editing, startCheckout, upsertInvoice, router]
  );

  const handleRowAction = useCallback(
    async (invoiceId: string, action: "link" | "charge" | "markPaid" | "void") => {
      setRowBusyId(invoiceId);
      setBanner(null);
      try {
        if (action === "link" || action === "charge") {
          await startCheckout(invoiceId, action);
        } else if (action === "markPaid") {
          const res = await fetch(`/api/private-pay/invoices/${invoiceId}/mark-paid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method: "manual" }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            invoice?: PrivatePayInvoiceWithItems;
            error?: string;
          };
          if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to mark paid");
          upsertInvoice(json.invoice);
          setBanner({ kind: "ok", text: "Invoice marked paid." });
          router.refresh();
        } else if (action === "void") {
          if (!window.confirm("Void this invoice? This cannot be undone.")) return;
          const res = await fetch(`/api/private-pay/invoices/${invoiceId}/void`, { method: "POST" });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            invoice?: PrivatePayInvoiceWithItems;
            error?: string;
          };
          if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to void invoice");
          upsertInvoice(json.invoice);
          setBanner({ kind: "ok", text: "Invoice voided." });
          router.refresh();
        }
      } catch (e) {
        setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
      } finally {
        setRowBusyId(null);
      }
    },
    [startCheckout, upsertInvoice, router]
  );

  const actionBtn =
    "rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 whitespace-nowrap";

  return (
    <div className="rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-5 shadow-sm ring-1 ring-emerald-100/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Private Pay Billing</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Direct self-pay invoices for this patient. Separate from Medicare/insurance and Alora. Card payments are
            processed securely by Stripe.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalError(null);
            setModalOpen(true);
          }}
          disabled={!contactId}
          className="rounded-lg border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          + New invoice
        </button>
      </div>

      {!contactId ? (
        <p className="mt-3 text-sm text-amber-800">No linked contact — link a contact to bill this record.</p>
      ) : null}

      {banner ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {paymentLink ? (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
          <p className="font-semibold">Payment link for {paymentLink.invoiceNumber}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={paymentLink.url}
              className="min-w-0 flex-1 rounded border border-sky-200 bg-white px-2 py-1 text-xs text-slate-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(paymentLink.url).then(
                  () => setBanner({ kind: "ok", text: "Payment link copied to clipboard." }),
                  () => undefined
                );
              }}
              className="rounded-md border border-sky-600 bg-white px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setPaymentLink(null)}
              className="rounded-md px-2 py-1 text-xs text-sky-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-1 text-[11px] text-sky-800/80">Send this link to the patient. It opens Stripe&apos;s secure payment page.</p>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No private-pay invoices yet.</p>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Invoice #</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Services</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Paid date</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const isOpenStatus = invoice.status === "draft" || invoice.status === "sent";
                const rowBusy = rowBusyId === invoice.id;
                return (
                  <tr key={invoice.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium text-slate-900">{invoice.invoice_number}</td>
                    <td className="py-2 pr-3 text-slate-600">{formatDate(invoice.created_at)}</td>
                    <td className="py-2 pr-3 max-w-[14rem] text-slate-700">{servicesSummary(invoice)}</td>
                    <td className="py-2 pr-3 font-semibold tabular-nums text-slate-900">
                      {formatCentsUsd(invoice.total_cents)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[invoice.status]}`}
                      >
                        {PRIVATE_PAY_INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{formatDate(invoice.paid_at)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={`/api/private-pay/invoices/${invoice.id}/pdf`}
                          className={`${actionBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          Invoice PDF
                        </a>
                        {invoice.status === "paid" ? (
                          <a
                            href={`/api/private-pay/invoices/${invoice.id}/receipt`}
                            className={`${actionBtn} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
                          >
                            Receipt PDF
                          </a>
                        ) : null}
                        {isOpenStatus ? (
                          <>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => handleRowAction(invoice.id, "link")}
                              className={`${actionBtn} border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100`}
                            >
                              Payment link
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => handleRowAction(invoice.id, "charge")}
                              className={`${actionBtn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`}
                            >
                              Charge card
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => handleRowAction(invoice.id, "markPaid")}
                              className={`${actionBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                            >
                              Mark paid
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy || invoice.status !== "draft"}
                              onClick={() => {
                                setEditing(invoice);
                                setModalError(null);
                                setModalOpen(true);
                              }}
                              className={`${actionBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => handleRowAction(invoice.id, "void")}
                              className={`${actionBtn} border-rose-300 bg-white text-rose-700 hover:bg-rose-50`}
                            >
                              Void
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen ? (
        <PrivatePayInvoiceModal
          open={modalOpen}
          mode={editing ? "edit" : "create"}
          existing={editing}
          templates={templates}
          defaultBilling={defaultBilling}
          busy={busy}
          error={modalError}
          onClose={() => {
            if (busy) return;
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
