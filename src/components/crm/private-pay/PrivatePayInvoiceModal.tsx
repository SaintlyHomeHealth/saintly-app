"use client";

import { useMemo, useState } from "react";

import {
  PRIVATE_PAY_SERVICE_TYPES,
  PRIVATE_PAY_SERVICE_TYPE_LABELS,
  PRIVATE_PAY_UNIT_LABELS,
  PRIVATE_PAY_UNIT_LABEL_OPTIONS,
  type PrivatePayServiceType,
  type PrivatePayUnitLabel,
} from "@/lib/private-pay/constants";
import { computeLineTotalCents, dollarsToCents, formatCentsUsd } from "@/lib/private-pay/format";
import type {
  PrivatePayInvoiceInput,
  PrivatePayInvoiceWithItems,
  PrivatePayServiceTemplate,
} from "@/lib/private-pay/types";

type LineDraft = {
  key: string;
  service_type: PrivatePayServiceType;
  description: string;
  service_date: string;
  quantity: string;
  unit_label: PrivatePayUnitLabel;
  unit_amount: string;
};

let keySeq = 0;
function newLine(partial?: Partial<LineDraft>): LineDraft {
  keySeq += 1;
  return {
    key: `line-${keySeq}`,
    service_type: "respite_care",
    description: "",
    service_date: "",
    quantity: "1",
    unit_label: "visit",
    unit_amount: "",
    ...partial,
  };
}

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function lineToCents(line: LineDraft): { qty: number; unitCents: number; total: number } {
  const unitCents = dollarsToCents(line.unit_amount);
  if (line.unit_label === "flat") {
    return { qty: 1, unitCents, total: unitCents };
  }
  const qty = Number.parseFloat(line.quantity || "0") || 0;
  return { qty, unitCents, total: computeLineTotalCents(qty, unitCents) };
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
const labelCls = "flex flex-col gap-1 text-[11px] font-medium text-slate-600";

export function PrivatePayInvoiceModal({
  open,
  mode,
  existing,
  templates,
  defaultBilling,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  existing?: PrivatePayInvoiceWithItems | null;
  templates: PrivatePayServiceTemplate[];
  defaultBilling: { name?: string; email?: string; phone?: string; address?: string };
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: PrivatePayInvoiceInput) => void;
}) {
  const [billingName, setBillingName] = useState(existing?.billing_name ?? defaultBilling.name ?? "");
  const [billingEmail, setBillingEmail] = useState(existing?.billing_email ?? defaultBilling.email ?? "");
  const [billingPhone, setBillingPhone] = useState(existing?.billing_phone ?? defaultBilling.phone ?? "");
  const [billingAddress, setBillingAddress] = useState(existing?.billing_address ?? defaultBilling.address ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [discount, setDiscount] = useState(existing ? centsToDollarString(existing.discount_cents) : "0.00");
  const [tax, setTax] = useState(existing ? centsToDollarString(existing.tax_cents) : "0.00");
  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (existing && existing.items.length > 0) {
      return existing.items.map((item) =>
        newLine({
          service_type: item.service_type,
          description: item.description ?? "",
          service_date: item.service_date ?? "",
          quantity: String(item.quantity ?? 1),
          unit_label: item.unit_label,
          unit_amount: centsToDollarString(item.unit_amount_cents),
        })
      );
    }
    return [newLine()];
  });

  const templatesByType = useMemo(() => {
    const map = new Map<PrivatePayServiceType, PrivatePayServiceTemplate>();
    for (const t of templates) {
      if (!map.has(t.service_type)) map.set(t.service_type, t);
    }
    return map;
  }, [templates]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + lineToCents(line).total, 0);
    const discountCents = Math.min(dollarsToCents(discount), subtotal);
    const taxCents = dollarsToCents(tax);
    const total = Math.max(0, subtotal - discountCents + taxCents);
    return { subtotal, discountCents, taxCents, total };
  }, [lines, discount, tax]);

  if (!open) return null;

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onServiceTypeChange(key: string, value: PrivatePayServiceType) {
    const template = templatesByType.get(value);
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const next: LineDraft = { ...line, service_type: value };
        // Suggest the template defaults, but keep anything the admin already typed.
        if (template) {
          if (!line.unit_amount) next.unit_amount = centsToDollarString(template.default_unit_amount_cents);
          next.unit_label = template.default_unit_label;
          if (!line.description) next.description = template.name;
        }
        return next;
      })
    );
  }

  function buildInput(): PrivatePayInvoiceInput {
    return {
      billing_name: billingName,
      billing_email: billingEmail,
      billing_phone: billingPhone,
      billing_address: billingAddress,
      notes,
      discount_cents: totals.discountCents,
      tax_cents: totals.taxCents,
      items: lines.map((line) => {
        const { qty, unitCents } = lineToCents(line);
        return {
          service_type: line.service_type,
          description: line.description || null,
          service_date: line.service_date || null,
          quantity: line.unit_label === "flat" ? 1 : qty,
          unit_label: line.unit_label,
          unit_amount_cents: unitCents,
        };
      }),
    };
  }

  const canSubmit = totals.total > 0 && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {mode === "edit" ? "Edit private-pay invoice" : "New private-pay invoice"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Custom rates per patient. Amounts are always editable — templates only suggest defaults.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Billing contact</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Billing name
                <input className={inputCls} value={billingName} onChange={(e) => setBillingName(e.target.value)} />
              </label>
              <label className={labelCls}>
                Billing email
                <input
                  className={inputCls}
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  placeholder="Used for the Stripe receipt"
                />
              </label>
              <label className={labelCls}>
                Billing phone
                <input className={inputCls} value={billingPhone} onChange={(e) => setBillingPhone(e.target.value)} />
              </label>
              <label className={labelCls}>
                Billing address
                <input
                  className={inputCls}
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Line items</p>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="rounded-lg border border-sky-600 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
              >
                + Add line item
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {lines.map((line) => {
                const { total } = lineToCents(line);
                return (
                  <div key={line.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Service type
                        <select
                          className={inputCls}
                          value={line.service_type}
                          onChange={(e) => onServiceTypeChange(line.key, e.target.value as PrivatePayServiceType)}
                        >
                          {PRIVATE_PAY_SERVICE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {PRIVATE_PAY_SERVICE_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Description
                        <input
                          className={inputCls}
                          value={line.description}
                          onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          placeholder="e.g. Respite care services"
                        />
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <label className={labelCls}>
                        Service date
                        <input
                          type="date"
                          className={inputCls}
                          value={line.service_date}
                          onChange={(e) => updateLine(line.key, { service_date: e.target.value })}
                        />
                      </label>
                      <label className={labelCls}>
                        Unit label
                        <select
                          className={inputCls}
                          value={line.unit_label}
                          onChange={(e) => updateLine(line.key, { unit_label: e.target.value as PrivatePayUnitLabel })}
                        >
                          {PRIVATE_PAY_UNIT_LABELS.map((u) => (
                            <option key={u} value={u}>
                              {PRIVATE_PAY_UNIT_LABEL_OPTIONS[u]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Quantity
                        <input
                          className={inputCls}
                          inputMode="decimal"
                          value={line.unit_label === "flat" ? "1" : line.quantity}
                          disabled={line.unit_label === "flat"}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        />
                      </label>
                      <label className={labelCls}>
                        {line.unit_label === "flat" ? "Flat amount" : "Unit price"}
                        <input
                          className={inputCls}
                          inputMode="decimal"
                          value={line.unit_amount}
                          onChange={(e) => updateLine(line.key, { unit_amount: e.target.value })}
                          placeholder="$0.00"
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Line total <span className="font-semibold text-slate-800">{formatCentsUsd(total)}</span>
                      </span>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          className="text-xs font-medium text-rose-700 hover:underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Discount
              <input className={inputCls} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label className={labelCls}>
              Tax
              <input className={inputCls} inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Notes
              <textarea
                className={inputCls}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes / payment terms (shown on the invoice/receipt)."
              />
            </label>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatCentsUsd(totals.subtotal)}</dd>
              </div>
              {totals.discountCents > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">- {formatCentsUsd(totals.discountCents)}</dd>
                </div>
              ) : null}
              {totals.taxCents > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <dt>Tax</dt>
                  <dd className="tabular-nums">{formatCentsUsd(totals.taxCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold text-slate-900">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCentsUsd(totals.total)}</dd>
              </div>
            </dl>
          </section>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit(buildInput())}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {mode === "edit" ? "Save changes" : "Save invoice"}
          </button>
        </div>
        <p className="px-6 pb-4 text-center text-[11px] text-slate-400 sm:text-right">
          After saving, charge a card on file, send the invoice, or mark it paid from the billing list.
        </p>
      </div>
    </div>
  );
}
