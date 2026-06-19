"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminActionButton, AdminActionLink, AdminBadge, AdminListCard } from "@/components/admin/design-system";
import type { AdminBadgeVariant } from "@/components/admin/design-system";
import { PRIVATE_PAY_INVOICE_STATUS_LABELS } from "@/lib/private-pay/constants";
import { formatCentsUsd, serviceTypeLabel } from "@/lib/private-pay/format";
import type { PrivatePayInvoiceListRow } from "@/lib/private-pay/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function servicesSummary(invoice: PrivatePayInvoiceListRow): string {
  const labels = invoice.items.map((i) => (i.description ?? "").trim() || serviceTypeLabel(i.service_type));
  if (labels.length === 0) return "—";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;
}

const STATUS_VARIANT: Record<string, AdminBadgeVariant> = {
  draft: "slate",
  sent: "amber",
  paid: "emerald",
  void: "slate",
  refunded: "rose",
};

export function PrivatePayInvoiceCard({
  invoice,
  busy,
  onCharge,
  onSendInvoice,
  onSendCardAuth,
  onMarkPaid,
  onSendReceipt,
  onVoid,
  onEdit,
  onDelete,
}: {
  invoice: PrivatePayInvoiceListRow;
  busy: boolean;
  onCharge: (invoice: PrivatePayInvoiceListRow) => void;
  onSendInvoice: (invoice: PrivatePayInvoiceListRow) => void;
  onSendCardAuth?: (invoice: PrivatePayInvoiceListRow) => void;
  onMarkPaid: (invoice: PrivatePayInvoiceListRow) => void;
  onSendReceipt: (invoice: PrivatePayInvoiceListRow) => void;
  onVoid: (invoice: PrivatePayInvoiceListRow) => void;
  onEdit: (invoice: PrivatePayInvoiceListRow) => void;
  onDelete: (invoice: PrivatePayInvoiceListRow) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isUnpaid = invoice.status === "draft" || invoice.status === "sent";
  const isPaid = invoice.status === "paid" || invoice.status === "refunded";
  const hasCard = invoice.has_card_on_file;
  const hasStripePayment =
    Boolean((invoice.stripe_payment_intent_id ?? "").trim()) ||
    invoice.payments.some((p) => p.status === "succeeded" && (p.stripe_payment_intent_id ?? "").trim());

  const closeMenu = () => setMenuOpen(false);

  return (
    <AdminListCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/private-pay/invoices/${invoice.id}`}
              className="text-sm font-bold text-sky-900 hover:underline"
            >
              {invoice.invoice_number}
            </Link>
            <AdminBadge variant={STATUS_VARIANT[invoice.status] ?? "slate"}>
              {PRIVATE_PAY_INVOICE_STATUS_LABELS[invoice.status]}
            </AdminBadge>
            {isUnpaid && hasCard ? <AdminBadge variant="sky">Card on file</AdminBadge> : null}
            {invoice.pending_payment_report ? <AdminBadge variant="amber">Payment reported</AdminBadge> : null}
          </div>
          <p className="text-sm font-semibold text-slate-900">{invoice.customer_name}</p>
          {invoice.customer_detail && invoice.profile_href ? (
            <Link href={invoice.profile_href} className="text-[11px] font-semibold text-sky-800 hover:underline">
              {invoice.customer_detail} profile
            </Link>
          ) : null}
          <p className="text-xs text-slate-600">{servicesSummary(invoice)}</p>
          <p className="text-[11px] text-slate-400">
            Created {formatDate(invoice.created_at)}
            {isPaid ? ` · Paid ${formatDate(invoice.paid_at)}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums text-slate-900">{formatCentsUsd(invoice.total_cents)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {isUnpaid ? (
          <>
            <AdminActionButton variant="primary" size="md" disabled={busy} onClick={() => onCharge(invoice)}>
              Charge card
            </AdminActionButton>
            <AdminActionButton variant="text" size="md" disabled={busy} onClick={() => onSendInvoice(invoice)}>
              Send invoice
            </AdminActionButton>
            <AdminActionButton variant="secondary" size="md" disabled={busy} onClick={() => onMarkPaid(invoice)}>
              Mark paid
            </AdminActionButton>
          </>
        ) : isPaid ? (
          <>
            <AdminActionLink variant="call" size="md" href={`/api/private-pay/invoices/${invoice.id}/receipt`}>
              Receipt PDF
            </AdminActionLink>
            <AdminActionButton variant="text" size="md" disabled={busy} onClick={() => onSendReceipt(invoice)}>
              Send receipt
            </AdminActionButton>
          </>
        ) : null}

        <div className="relative ml-auto">
          <AdminActionButton variant="ghost" size="md" disabled={busy} onClick={() => setMenuOpen((v) => !v)}>
            More ▾
          </AdminActionButton>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={closeMenu}
              />
              <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {isUnpaid ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      onEdit(invoice);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View / edit
                  </button>
                ) : null}
                <a
                  href={`/api/private-pay/invoices/${invoice.id}/pdf`}
                  onClick={closeMenu}
                  className="block w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Invoice PDF
                </a>
                {isUnpaid && invoice.contact_id && onSendCardAuth ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onSendCardAuth(invoice);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Send card authorization link
                  </button>
                ) : null}
                {isUnpaid ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onVoid(invoice);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Void
                  </button>
                ) : null}
                {!hasStripePayment ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      closeMenu();
                      onDelete(invoice);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Delete permanently
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </AdminListCard>
  );
}
