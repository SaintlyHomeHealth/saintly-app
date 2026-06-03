"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import {
  PRIVATE_PAY_INVOICE_STATUS_LABELS,
  type PrivatePayInvoiceStatus,
} from "@/lib/private-pay/constants";
import { formatCentsUsd, serviceTypeLabel } from "@/lib/private-pay/format";
import type {
  PrivatePayInvoiceInput,
  PrivatePayInvoiceListRow,
  PrivatePayInvoiceWithItems,
  PrivatePayRecipient,
  PrivatePayServiceTemplate,
} from "@/lib/private-pay/types";
import { PrivatePayInvoiceModal, type InvoiceSubmitAction } from "./PrivatePayInvoiceModal";
import { PrivatePayRecipientPicker } from "./PrivatePayRecipientPicker";

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

const actionBtn =
  "rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 whitespace-nowrap";

export function PrivatePayAdminWorkspace({
  templates,
  initialInvoices,
}: {
  templates: PrivatePayServiceTemplate[];
  initialInvoices: PrivatePayInvoiceListRow[];
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<PrivatePayInvoiceListRow[]>(initialInvoices);
  const [recipient, setRecipient] = useState<PrivatePayRecipient | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PrivatePayInvoiceWithItems | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [paymentLink, setPaymentLink] = useState<{ invoiceNumber: string; url: string } | null>(null);

  const upsertInvoice = useCallback(
    (invoice: PrivatePayInvoiceWithItems, hint?: PrivatePayRecipient | null) => {
      setInvoices((prev) => {
        const prevRow = prev.find((i) => i.id === invoice.id);
        let customer_detail = prevRow?.customer_detail ?? null;
        let profile_href = prevRow?.profile_href ?? null;
        if (!prevRow) {
          if (invoice.patient_id) {
            customer_detail = "Patient";
            profile_href = `/admin/crm/patients/${invoice.patient_id}`;
          } else if (invoice.lead_id) {
            customer_detail = "Lead";
            profile_href = `/admin/crm/leads/${invoice.lead_id}`;
          } else if (invoice.contact_id) {
            customer_detail = "Contact";
            profile_href = `/admin/crm/contacts/${invoice.contact_id}`;
          }
        }
        const enriched: PrivatePayInvoiceListRow = {
          ...invoice,
          customer_name:
            (invoice.billing_name ?? "").trim() ||
            hint?.billing.name ||
            prevRow?.customer_name ||
            "—",
          customer_detail,
          profile_href,
        };
        const exists = prev.some((i) => i.id === invoice.id);
        return exists ? prev.map((i) => (i.id === invoice.id ? { ...i, ...enriched } : i)) : [enriched, ...prev];
      });
    },
    []
  );

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

  const resolveContext = useCallback(() => {
    if (editing) {
      return {
        contact_id: editing.contact_id,
        patient_id: editing.patient_id,
        lead_id: editing.lead_id,
      };
    }
    if (recipient) {
      return {
        contact_id: recipient.contact_id,
        patient_id: recipient.patient_id,
        lead_id: recipient.lead_id,
      };
    }
    return null;
  }, [editing, recipient]);

  const handleSubmit = useCallback(
    async (action: InvoiceSubmitAction, input: PrivatePayInvoiceInput) => {
      const ctx = resolveContext();
      if (!ctx?.contact_id) {
        setModalError("Select a contact, patient, or lead first.");
        return;
      }

      setBusy(true);
      setModalError(null);
      try {
        const payload: PrivatePayInvoiceInput = {
          ...input,
          ...ctx,
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
        upsertInvoice(json.invoice, recipient);
        const invoiceId = json.invoice.id;
        setModalOpen(false);
        setEditing(null);
        setRecipient(null);
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
    [editing, recipient, resolveContext, startCheckout, upsertInvoice, router]
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

  const openEdit = (invoice: PrivatePayInvoiceListRow) => {
    setEditing(invoice);
    setRecipient(null);
    setModalError(null);
    setModalOpen(true);
  };

  const modalBilling = editing
    ? {
        name: editing.billing_name ?? "",
        email: editing.billing_email ?? "",
        phone: editing.billing_phone ?? "",
        address: editing.billing_address ?? "",
      }
    : recipient?.billing ?? { name: "", email: "", phone: "", address: "" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setRecipient(null);
            setModalError(null);
            setPickerOpen(true);
          }}
          className={crmPrimaryCtaCls}
        >
          + New Private Pay Invoice
        </button>
      </div>

      {banner ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {paymentLink ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-semibold">Payment link for {paymentLink.invoiceNumber}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={paymentLink.url}
              className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1.5 text-xs text-slate-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(paymentLink.url).then(
                    () => setBanner({ kind: "ok", text: "Payment link copied to clipboard." }),
                    () => undefined
                    );
                }}
                className="rounded-lg border border-sky-600 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={() => setPaymentLink(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-sky-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={crmListScrollOuterCls}>
        {invoices.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No private-pay invoices yet. Create one to get started.</p>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 pr-3">Invoice #</th>
                <th className="py-3 pr-3">Customer</th>
                <th className="py-3 pr-3">Services</th>
                <th className="py-3 pr-3">Total</th>
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 pr-3">Created</th>
                <th className="py-3 pr-3">Paid</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const isOpenStatus = invoice.status === "draft" || invoice.status === "sent";
                const rowBusy = rowBusyId === invoice.id;
                return (
                  <tr key={invoice.id} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="px-4 py-3 pr-3 font-medium text-slate-900">{invoice.invoice_number}</td>
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-800">{invoice.customer_name}</p>
                      {invoice.customer_detail && invoice.profile_href ? (
                        <Link href={invoice.profile_href} className="text-[11px] font-semibold text-sky-800 hover:underline">
                          {invoice.customer_detail} profile
                        </Link>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 max-w-[12rem] text-slate-700">{servicesSummary(invoice)}</td>
                    <td className="py-3 pr-3 font-semibold tabular-nums text-slate-900">
                      {formatCentsUsd(invoice.total_cents)}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[invoice.status]}`}
                      >
                        {PRIVATE_PAY_INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">{formatDate(invoice.created_at)}</td>
                    <td className="py-3 pr-3 text-slate-600">{formatDate(invoice.paid_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[20rem] flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={rowBusy || invoice.status !== "draft"}
                          onClick={() => openEdit(invoice)}
                          className={`${actionBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                        >
                          View/Edit
                        </button>
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

      <PrivatePayRecipientPicker
        open={pickerOpen}
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPickerOpen(false);
        }}
        onSelect={(row) => {
          setRecipient(row);
          setPickerOpen(false);
          setEditing(null);
          setModalError(null);
          setModalOpen(true);
        }}
      />

      {modalOpen ? (
        <PrivatePayInvoiceModal
          open={modalOpen}
          mode={editing ? "edit" : "create"}
          existing={editing}
          templates={templates}
          defaultBilling={modalBilling}
          busy={busy}
          error={modalError}
          onClose={() => {
            if (busy) return;
            setModalOpen(false);
            setEditing(null);
            setRecipient(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : null}
    </div>
  );
}
