"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, FileText, PiggyBank, Wallet } from "lucide-react";

import {
  AdminHeroHeader,
  AdminStatCard,
  AdminStatCardGrid,
  AdminTabsBar,
} from "@/components/admin/design-system";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { formatCentsUsd } from "@/lib/private-pay/format";
import type {
  PrivatePayInvoiceInput,
  PrivatePayInvoiceListRow,
  PrivatePayInvoiceWithItems,
  PrivatePayRecipient,
  PrivatePayServiceTemplate,
} from "@/lib/private-pay/types";
import { PrivatePayInvoiceModal } from "./PrivatePayInvoiceModal";
import { PrivatePayInvoiceCard } from "./PrivatePayInvoiceCard";
import { PrivatePayRecipientPicker } from "./PrivatePayRecipientPicker";
import { PrivatePayRecordPaymentModal } from "./PrivatePayRecordPaymentModal";
import { PrivatePaySendModal } from "./PrivatePaySendModal";
import { PrivatePayDeleteInvoiceModal } from "./PrivatePayDeleteInvoiceModal";
import {
  hardDeleteInvoice,
  recordManualPayment,
  sendInvoice,
  sendReceipt,
  voidInvoice as voidInvoiceAction,
  type RecordPaymentPayload,
  type SendChannel,
} from "./private-pay-client-actions";

type TabKey = "unpaid" | "paid" | "all";

function isUnpaidStatus(status: string): boolean {
  return status === "draft" || status === "sent";
}
function isPaidStatus(status: string): boolean {
  return status === "paid" || status === "refunded";
}

export function PrivatePayAdminWorkspace({
  templates,
  initialInvoices,
}: {
  templates: PrivatePayServiceTemplate[];
  initialInvoices: PrivatePayInvoiceListRow[];
}) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<PrivatePayInvoiceListRow[]>(initialInvoices);
  const [tab, setTab] = useState<TabKey>("unpaid");
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  // Create / edit invoice
  const [recipient, setRecipient] = useState<PrivatePayRecipient | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PrivatePayInvoiceWithItems | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Send invoice / receipt
  const [sendFor, setSendFor] = useState<{ row: PrivatePayInvoiceListRow; mode: "invoice" | "receipt" } | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Mark paid
  const [recordFor, setRecordFor] = useState<PrivatePayInvoiceListRow | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Hard delete
  const [deleteFor, setDeleteFor] = useState<PrivatePayInvoiceListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          pending_payment_report:
            invoice.status === "paid" || invoice.status === "void"
              ? null
              : (prevRow?.pending_payment_report ?? null),
          has_card_on_file: false,
          payment_badge: invoice.status === "paid" ? "paid" : (prevRow?.payment_badge ?? "unpaid"),
        };
        const exists = prev.some((i) => i.id === invoice.id);
        return exists ? prev.map((i) => (i.id === invoice.id ? { ...i, ...enriched } : i)) : [enriched, ...prev];
      });
    },
    []
  );

  const stats = useMemo(() => {
    const unpaid = invoices.filter((i) => isUnpaidStatus(i.status));
    const unpaidTotal = unpaid.reduce((sum, i) => sum + i.total_cents, 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let paidThisMonthCount = 0;
    let paidThisMonthCents = 0;
    let totalRevenueCents = 0;
    for (const i of invoices) {
      if (!isPaidStatus(i.status)) continue;
      totalRevenueCents += i.total_cents;
      if (!i.paid_at) continue;
      const t = new Date(i.paid_at).getTime();
      if (!Number.isNaN(t) && t >= monthStart) {
        paidThisMonthCount += 1;
        paidThisMonthCents += i.total_cents;
      }
    }

    return {
      unpaidCount: unpaid.length,
      unpaidTotal,
      paidCount: invoices.filter((i) => isPaidStatus(i.status)).length,
      paidThisMonthCount,
      paidThisMonthCents,
      totalRevenueCents,
    };
  }, [invoices]);

  const visible = useMemo(() => {
    if (tab === "unpaid") return invoices.filter((i) => isUnpaidStatus(i.status));
    if (tab === "paid") return invoices.filter((i) => isPaidStatus(i.status));
    return invoices;
  }, [invoices, tab]);

  const resolveContext = useCallback(() => {
    if (editing) {
      return { contact_id: editing.contact_id, patient_id: editing.patient_id, lead_id: editing.lead_id };
    }
    if (recipient) {
      return { contact_id: recipient.contact_id, patient_id: recipient.patient_id, lead_id: recipient.lead_id };
    }
    return null;
  }, [editing, recipient]);

  const handleSubmit = useCallback(
    async (input: PrivatePayInvoiceInput) => {
      const ctx = resolveContext();
      if (!ctx?.contact_id) {
        setModalError("Select a contact, patient, or lead first.");
        return;
      }
      setBusy(true);
      setModalError(null);
      try {
        const isEdit = Boolean(editing);
        const res = await fetch(isEdit ? `/api/private-pay/invoices/${editing!.id}` : "/api/private-pay/invoices", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, ...ctx }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          invoice?: PrivatePayInvoiceWithItems;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.invoice) throw new Error(json.error || "Failed to save invoice");
        upsertInvoice(json.invoice, recipient);
        setModalOpen(false);
        setEditing(null);
        setRecipient(null);
        setBanner({ kind: "ok", text: `Invoice ${json.invoice.invoice_number} saved.` });
        router.refresh();
      } catch (e) {
        setModalError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [editing, recipient, resolveContext, upsertInvoice, router]
  );

  const openSend = useCallback((row: PrivatePayInvoiceListRow, mode: "invoice" | "receipt") => {
    setSendError(null);
    setSendFor({ row, mode });
  }, []);

  const confirmSend = useCallback(
    async (channels: SendChannel[]) => {
      if (!sendFor) return;
      setSendBusy(true);
      setSendError(null);
      try {
        let lastInvoice: PrivatePayInvoiceWithItems | null = null;
        const sentTo: string[] = [];
        for (const channel of channels) {
          if (sendFor.mode === "invoice") {
            const r = await sendInvoice(sendFor.row.id, channel);
            if (r.invoice) lastInvoice = r.invoice;
            if (r.sentTo) sentTo.push(r.sentTo);
          } else {
            const r = await sendReceipt(sendFor.row.id, channel);
            if (r.sentTo) sentTo.push(r.sentTo);
          }
        }
        if (lastInvoice) upsertInvoice(lastInvoice);
        const label = sendFor.mode === "invoice" ? "Invoice" : "Receipt";
        setSendFor(null);
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
    },
    [sendFor, upsertInvoice, router]
  );

  const submitRecord = useCallback(
    async (payload: RecordPaymentPayload) => {
      if (!recordFor) return;
      setRecordBusy(true);
      setRecordError(null);
      try {
        const { invoice, receiptWarning } = await recordManualPayment(recordFor.id, payload);
        upsertInvoice(invoice);
        setRecordFor(null);
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
    },
    [recordFor, upsertInvoice, router]
  );

  const handleVoid = useCallback(
    async (row: PrivatePayInvoiceListRow) => {
      if (!window.confirm("Void this invoice? This cannot be undone.")) return;
      setRowBusyId(row.id);
      setBanner(null);
      try {
        const invoice = await voidInvoiceAction(row.id);
        upsertInvoice(invoice);
        setBanner({ kind: "ok", text: "Invoice voided." });
        router.refresh();
      } catch (e) {
        setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
      } finally {
        setRowBusyId(null);
      }
    },
    [upsertInvoice, router]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteFor) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await hardDeleteInvoice(deleteFor.id);
      setInvoices((prev) => prev.filter((i) => i.id !== deleteFor.id));
      setDeleteFor(null);
      setBanner({ kind: "ok", text: `Invoice ${deleteFor.invoice_number} deleted.` });
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteFor, router]);

  const openEdit = useCallback((row: PrivatePayInvoiceListRow) => {
    setEditing(row);
    setRecipient(null);
    setModalError(null);
    setModalOpen(true);
  }, []);

  const startNewInvoice = useCallback(() => {
    setEditing(null);
    setRecipient(null);
    setModalError(null);
    setPickerOpen(true);
  }, []);

  const modalBilling = editing
    ? {
        name: editing.billing_name ?? "",
        email: editing.billing_email ?? "",
        phone: editing.billing_phone ?? "",
        address: editing.billing_address ?? "",
      }
    : recipient?.billing ?? { name: "", email: "", phone: "", address: "" };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "unpaid", label: "Unpaid", count: stats.unpaidCount },
    { key: "paid", label: "Paid", count: stats.paidCount },
    { key: "all", label: "All", count: invoices.length },
  ];

  return (
    <>
      <AdminHeroHeader
        eyebrow="Billing"
        title="Private Pay Billing"
        description="Create invoices, send them to clients, and record payments received through Square or other methods."
        actions={
          <button type="button" onClick={startNewInvoice} className={crmPrimaryCtaCls}>
            + New invoice
          </button>
        }
      />

      <AdminStatCardGrid columns={4}>
        <AdminStatCard label="Unpaid invoices" value={stats.unpaidCount} accent="amber" icon={FileText} />
        <AdminStatCard label="Total unpaid" value={formatCentsUsd(stats.unpaidTotal)} accent="sky" icon={Wallet} />
        <AdminStatCard
          label="Paid this month"
          value={formatCentsUsd(stats.paidThisMonthCents)}
          accent="emerald"
          icon={PiggyBank}
          hint={`${stats.paidThisMonthCount} invoice${stats.paidThisMonthCount === 1 ? "" : "s"}`}
        />
        <AdminStatCard
          label="Total private-pay revenue"
          value={formatCentsUsd(stats.totalRevenueCents)}
          accent="indigo"
          icon={DollarSign}
          hint={`${stats.paidCount} paid invoice${stats.paidCount === 1 ? "" : "s"}`}
        />
      </AdminStatCardGrid>

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

      <AdminTabsBar>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                active ? "bg-sky-600 text-white shadow-sm shadow-sky-200/60" : "text-slate-600 hover:bg-sky-50 hover:text-sky-900"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </AdminTabsBar>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-16 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-800">
            {tab === "unpaid"
              ? "No unpaid invoices"
              : tab === "paid"
                ? "No paid invoices yet"
                : "No private-pay invoices yet"}
          </p>
          <p className="mt-2 text-sm text-slate-600">Create an invoice, send it to the client, and record payment when received.</p>
          <div className="mt-6">
            <button type="button" onClick={startNewInvoice} className={crmPrimaryCtaCls}>
              + New invoice
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((invoice) => (
            <PrivatePayInvoiceCard
              key={invoice.id}
              invoice={invoice}
              busy={rowBusyId === invoice.id}
              onSendInvoice={(row) => openSend(row, "invoice")}
              onMarkPaid={(row) => {
                setRecordError(null);
                setRecordFor(row);
              }}
              onSendReceipt={(row) => openSend(row, "receipt")}
              onVoid={handleVoid}
              onEdit={openEdit}
              onDelete={(row) => {
                setDeleteError(null);
                setDeleteFor(row);
              }}
            />
          ))}
        </div>
      )}

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

      <PrivatePayRecordPaymentModal
        open={Boolean(recordFor)}
        invoiceNumber={recordFor?.invoice_number ?? ""}
        totalCents={recordFor?.total_cents ?? 0}
        pendingReport={recordFor?.pending_payment_report ?? null}
        busy={recordBusy}
        error={recordError}
        onClose={() => {
          if (recordBusy) return;
          setRecordFor(null);
          setRecordError(null);
        }}
        onSubmit={submitRecord}
      />

      <PrivatePaySendModal
        open={Boolean(sendFor)}
        mode={sendFor?.mode ?? "invoice"}
        invoiceNumber={sendFor?.row.invoice_number ?? ""}
        email={sendFor?.row.billing_email ?? null}
        phone={sendFor?.row.billing_phone ?? null}
        busy={sendBusy}
        error={sendError}
        onClose={() => {
          if (sendBusy) return;
          setSendFor(null);
          setSendError(null);
        }}
        onConfirm={confirmSend}
      />

      <PrivatePayDeleteInvoiceModal
        open={Boolean(deleteFor)}
        invoiceNumber={deleteFor?.invoice_number ?? ""}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteFor(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}
