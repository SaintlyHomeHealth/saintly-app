import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  isPrivatePayReportPaymentMethod,
  isPrivatePayServiceType,
  isPrivatePayUnitLabel,
  type PrivatePayPaymentMethod,
} from "@/lib/private-pay/constants";
import { computeLineTotalCents } from "@/lib/private-pay/format";
import { notifyPrivatePayInvoicePaid } from "@/lib/private-pay/notify-admin-payment";
import { contactDirectoryDisplayName } from "@/lib/crm/contact-directory";
import type {
  PrivatePayInvoice,
  PrivatePayInvoiceInput,
  PrivatePayInvoiceItem,
  PrivatePayInvoiceItemInput,
  PrivatePayInvoiceListRow,
  PrivatePayInvoicePaymentBadge,
  PrivatePayInvoiceWithItems,
  PrivatePayPayment,
  PrivatePayPaymentReport,
  PrivatePayServiceTemplate,
} from "@/lib/private-pay/types";

type ContactBrief = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  contact_type: string | null;
};

const INVOICE_COLUMNS =
  "id, contact_id, patient_id, lead_id, invoice_number, public_token, status, billing_name, billing_email, billing_phone, billing_address, subtotal_cents, discount_cents, tax_cents, total_cents, notes, stripe_customer_id, stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_by, created_at, updated_at";

const ITEM_COLUMNS =
  "id, invoice_id, service_type, description, service_date, quantity, unit_label, unit_amount_cents, line_total_cents, sort_order, created_at";

const PAYMENT_COLUMNS =
  "id, invoice_id, receipt_number, amount_cents, payment_method, status, stripe_payment_intent_id, stripe_charge_id, card_brand, card_last4, customer_id, stripe_payment_method_id, failure_message, payment_reference, notes, paid_at, created_by, created_at";

const PAYMENT_REPORT_COLUMNS =
  "id, invoice_id, payment_method, amount_cents, reported_date, payment_reference, customer_note, status, created_at";

function sanitizeItems(items: PrivatePayInvoiceItemInput[]): Array<
  PrivatePayInvoiceItemInput & { line_total_cents: number; sort_order: number }
> {
  return (items ?? [])
    .map((raw, index) => {
      const service_type = isPrivatePayServiceType(raw.service_type) ? raw.service_type : "custom";
      const unit_label = isPrivatePayUnitLabel(raw.unit_label) ? raw.unit_label : "visit";
      const quantity =
        unit_label === "flat" ? 1 : Math.max(0, Number.isFinite(raw.quantity) ? Number(raw.quantity) : 0);
      const unit_amount_cents = Math.max(
        0,
        Number.isFinite(raw.unit_amount_cents) ? Math.round(Number(raw.unit_amount_cents)) : 0
      );
      const line_total_cents =
        unit_label === "flat" ? unit_amount_cents : computeLineTotalCents(quantity, unit_amount_cents);
      return {
        service_type,
        description: (raw.description ?? "").toString().trim() || null,
        service_date: raw.service_date ? String(raw.service_date) : null,
        quantity,
        unit_label,
        unit_amount_cents,
        line_total_cents,
        sort_order: index,
      };
    })
    .filter((item) => item.line_total_cents > 0 || item.unit_amount_cents > 0 || item.quantity > 0);
}

export function computeTotals(
  items: Array<{ line_total_cents: number }>,
  discountCents = 0,
  taxCents = 0
): { subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number } {
  const subtotal = items.reduce((sum, i) => sum + Math.max(0, i.line_total_cents), 0);
  const discount = Math.min(Math.max(0, discountCents), subtotal);
  const tax = Math.max(0, taxCents);
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: total };
}

export async function createInvoiceWithItems(
  input: PrivatePayInvoiceInput,
  createdBy: string | null
): Promise<PrivatePayInvoiceWithItems> {
  const items = sanitizeItems(input.items);
  if (items.length === 0) {
    throw new Error("An invoice needs at least one line item with an amount.");
  }
  const totals = computeTotals(items, input.discount_cents ?? 0, input.tax_cents ?? 0);

  const { data: invoice, error } = await supabaseAdmin
    .from("private_pay_invoices")
    .insert({
      contact_id: input.contact_id ?? null,
      patient_id: input.patient_id ?? null,
      lead_id: input.lead_id ?? null,
      status: "draft",
      billing_name: (input.billing_name ?? "").trim() || null,
      billing_email: (input.billing_email ?? "").trim() || null,
      billing_phone: (input.billing_phone ?? "").trim() || null,
      billing_address: (input.billing_address ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
      created_by: createdBy,
      ...totals,
    })
    .select(INVOICE_COLUMNS)
    .single();

  if (error || !invoice) {
    throw new Error(error?.message ?? "Failed to create invoice.");
  }

  const itemRows = items.map((item) => ({ ...item, invoice_id: invoice.id }));
  const { data: insertedItems, error: itemsError } = await supabaseAdmin
    .from("private_pay_invoice_items")
    .insert(itemRows)
    .select(ITEM_COLUMNS);

  if (itemsError) {
    // Roll back the invoice so we never leave an empty shell behind.
    await supabaseAdmin.from("private_pay_invoices").delete().eq("id", invoice.id);
    throw new Error(itemsError.message);
  }

  return {
    ...(invoice as PrivatePayInvoice),
    items: (insertedItems ?? []) as PrivatePayInvoiceItem[],
    payments: [],
  };
}

export async function updateDraftInvoice(
  invoiceId: string,
  input: PrivatePayInvoiceInput
): Promise<PrivatePayInvoiceWithItems> {
  const existing = await getInvoiceWithItems(invoiceId);
  if (!existing) throw new Error("Invoice not found.");
  if (existing.status !== "draft" && existing.status !== "sent") {
    throw new Error("Only draft or unpaid invoices can be edited.");
  }

  const items = sanitizeItems(input.items);
  if (items.length === 0) {
    throw new Error("An invoice needs at least one line item with an amount.");
  }
  const totals = computeTotals(items, input.discount_cents ?? 0, input.tax_cents ?? 0);

  const { error: updateError } = await supabaseAdmin
    .from("private_pay_invoices")
    .update({
      billing_name: (input.billing_name ?? "").trim() || null,
      billing_email: (input.billing_email ?? "").trim() || null,
      billing_phone: (input.billing_phone ?? "").trim() || null,
      billing_address: (input.billing_address ?? "").trim() || null,
      notes: (input.notes ?? "").trim() || null,
      ...totals,
    })
    .eq("id", invoiceId);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("private_pay_invoice_items").delete().eq("invoice_id", invoiceId);
  const itemRows = items.map((item) => ({ ...item, invoice_id: invoiceId }));
  const { error: itemsError } = await supabaseAdmin.from("private_pay_invoice_items").insert(itemRows);
  if (itemsError) throw new Error(itemsError.message);

  const updated = await getInvoiceWithItems(invoiceId);
  if (!updated) throw new Error("Invoice not found after update.");
  return updated;
}

export async function getInvoiceWithItems(invoiceId: string): Promise<PrivatePayInvoiceWithItems | null> {
  const { data: invoice, error } = await supabaseAdmin
    .from("private_pay_invoices")
    .select(INVOICE_COLUMNS)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !invoice) return null;

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabaseAdmin
      .from("private_pay_invoice_items")
      .select(ITEM_COLUMNS)
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("private_pay_payments")
      .select(PAYMENT_COLUMNS)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...(invoice as PrivatePayInvoice),
    items: (items ?? []) as PrivatePayInvoiceItem[],
    payments: (payments ?? []) as PrivatePayPayment[],
  };
}

/** Look up an invoice by its opaque public token (powers the HIPAA-safe pay link). */
export async function getInvoiceByPublicToken(
  token: string
): Promise<PrivatePayInvoiceWithItems | null> {
  const trimmed = (token ?? "").trim();
  if (!trimmed) return null;
  const { data: invoice, error } = await supabaseAdmin
    .from("private_pay_invoices")
    .select(INVOICE_COLUMNS)
    .eq("public_token", trimmed)
    .maybeSingle();
  if (error || !invoice) return null;
  return getInvoiceWithItems((invoice as PrivatePayInvoice).id);
}

function derivePaymentBadge(
  invoice: PrivatePayInvoiceWithItems,
  hasCardOnFile: boolean
): PrivatePayInvoicePaymentBadge {
  if (invoice.status === "paid") return "paid";
  const pendingCard = invoice.payments.some((p) => p.status === "pending" && p.payment_method === "card");
  if (pendingCard) return "processing";
  const failedCard = invoice.payments.some((p) => p.status === "failed" && p.payment_method === "card");
  if (failedCard) return "failed";
  if (hasCardOnFile && (invoice.status === "draft" || invoice.status === "sent")) return "card_on_file";
  return "unpaid";
}

async function loadCardOnFileByContact(contactIds: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (contactIds.length === 0) return result;

  const { data: customers } = await supabaseAdmin
    .from("private_pay_customers")
    .select("id, contact_id")
    .in("contact_id", contactIds);

  const customerRows = (customers ?? []) as { id: string; contact_id: string }[];
  if (customerRows.length === 0) {
    for (const id of contactIds) result.set(id, false);
    return result;
  }

  const customerIds = customerRows.map((c) => c.id);
  const { data: methods } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .select("customer_id")
    .in("customer_id", customerIds);

  const customersWithCards = new Set(
    ((methods ?? []) as { customer_id: string }[]).map((m) => m.customer_id)
  );
  const contactByCustomer = new Map(customerRows.map((c) => [c.id, c.contact_id]));

  for (const contactId of contactIds) {
    result.set(contactId, false);
  }
  for (const customerId of customersWithCards) {
    const contactId = contactByCustomer.get(customerId);
    if (contactId) result.set(contactId, true);
  }
  return result;
}

async function attachPendingPaymentReports(
  invoices: PrivatePayInvoiceWithItems[]
): Promise<Map<string, PrivatePayPaymentReport>> {
  if (invoices.length === 0) return new Map();
  const openIds = invoices
    .filter((i) => i.status === "draft" || i.status === "sent")
    .map((i) => i.id);
  if (openIds.length === 0) return new Map();

  const { data: reports } = await supabaseAdmin
    .from("private_pay_payment_reports")
    .select(PAYMENT_REPORT_COLUMNS)
    .in("invoice_id", openIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const byInvoice = new Map<string, PrivatePayPaymentReport>();
  for (const row of (reports ?? []) as PrivatePayPaymentReport[]) {
    if (!byInvoice.has(row.invoice_id)) byInvoice.set(row.invoice_id, row);
  }
  return byInvoice;
}

async function attachItemsAndPayments(invoices: PrivatePayInvoice[]): Promise<PrivatePayInvoiceWithItems[]> {
  if (invoices.length === 0) return [];
  const ids = invoices.map((i) => i.id);
  const [{ data: items }, { data: payments }] = await Promise.all([
    supabaseAdmin
      .from("private_pay_invoice_items")
      .select(ITEM_COLUMNS)
      .in("invoice_id", ids)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("private_pay_payments")
      .select(PAYMENT_COLUMNS)
      .in("invoice_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const itemsByInvoice = new Map<string, PrivatePayInvoiceItem[]>();
  for (const item of (items ?? []) as PrivatePayInvoiceItem[]) {
    const list = itemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoice_id, list);
  }
  const paymentsByInvoice = new Map<string, PrivatePayPayment[]>();
  for (const payment of (payments ?? []) as PrivatePayPayment[]) {
    const list = paymentsByInvoice.get(payment.invoice_id) ?? [];
    list.push(payment);
    paymentsByInvoice.set(payment.invoice_id, list);
  }

  return invoices.map((invoice) => ({
    ...invoice,
    items: itemsByInvoice.get(invoice.id) ?? [],
    payments: paymentsByInvoice.get(invoice.id) ?? [],
  }));
}

/** All private-pay invoices for the admin billing hub (newest first). */
export async function listAllPrivatePayInvoices(limit = 500): Promise<PrivatePayInvoiceListRow[]> {
  const { data: invoices, error } = await supabaseAdmin
    .from("private_pay_invoices")
    .select(INVOICE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !invoices?.length) return [];

  const withItems = await attachItemsAndPayments(invoices as PrivatePayInvoice[]);
  const contactIds = [...new Set(withItems.map((i) => i.contact_id).filter(Boolean))] as string[];

  const contactById = new Map<string, ContactBrief>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, organization_name, contact_type")
      .in("id", contactIds);
    for (const c of (contacts ?? []) as ContactBrief[]) {
      contactById.set(c.id, c);
    }
  }

  const pendingByInvoice = await attachPendingPaymentReports(withItems);
  const cardOnFileByContact = await loadCardOnFileByContact(contactIds);

  return withItems.map((invoice) => {
    const contact = invoice.contact_id ? contactById.get(invoice.contact_id) : null;
    const contactName = contact ? contactDirectoryDisplayName(contact) : null;
    const customer_name = (invoice.billing_name ?? "").trim() || contactName || "—";

    let customer_detail: string | null = null;
    let profile_href: string | null = null;
    if (invoice.patient_id) {
      customer_detail = "Patient";
      profile_href = `/admin/crm/patients/${invoice.patient_id}`;
    } else if (invoice.lead_id) {
      customer_detail = "Lead";
      profile_href = `/admin/crm/leads/${invoice.lead_id}`;
    } else if (invoice.contact_id) {
      customer_detail =
        (contact?.contact_type ?? "").trim() === "private_pay" ? "Private Pay" : "Contact";
      profile_href = `/admin/crm/contacts/${invoice.contact_id}`;
    }

    const has_card_on_file = invoice.contact_id ? cardOnFileByContact.get(invoice.contact_id) ?? false : false;

    return {
      ...invoice,
      customer_name,
      customer_detail,
      profile_href,
      pending_payment_report: pendingByInvoice.get(invoice.id) ?? null,
      has_card_on_file,
      payment_badge: derivePaymentBadge(invoice, has_card_on_file),
    };
  });
}

/** Customer "I sent payment" — never marks the invoice paid. */
export async function createPrivatePayPaymentReport(
  invoiceId: string,
  input: {
    method: string;
    amountCents?: number | null;
    reportedDate?: string | null;
    reference?: string | null;
    customerNote?: string | null;
  }
): Promise<PrivatePayPaymentReport> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") throw new Error("This invoice is already paid.");
  if (invoice.status === "void") throw new Error("This invoice is no longer payable.");
  if (!isPrivatePayReportPaymentMethod(input.method)) {
    throw new Error("Invalid payment method.");
  }

  const { data, error } = await supabaseAdmin
    .from("private_pay_payment_reports")
    .insert({
      invoice_id: invoiceId,
      payment_method: input.method,
      amount_cents: input.amountCents ?? null,
      reported_date: input.reportedDate ?? null,
      payment_reference: (input.reference ?? "").trim() || null,
      customer_note: (input.customerNote ?? "").trim() || null,
      status: "pending",
    })
    .select(PAYMENT_REPORT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save payment report.");
  return data as PrivatePayPaymentReport;
}

export async function getPendingPaymentReportForInvoice(
  invoiceId: string
): Promise<PrivatePayPaymentReport | null> {
  const { data } = await supabaseAdmin
    .from("private_pay_payment_reports")
    .select(PAYMENT_REPORT_COLUMNS)
    .eq("invoice_id", invoiceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PrivatePayPaymentReport | null) ?? null;
}

async function markPaymentReportsReviewedForInvoice(invoiceId: string): Promise<void> {
  await supabaseAdmin
    .from("private_pay_payment_reports")
    .update({ status: "reviewed" })
    .eq("invoice_id", invoiceId)
    .eq("status", "pending");
}

export async function listInvoicesForContact(contactId: string): Promise<PrivatePayInvoiceWithItems[]> {
  const { data: invoices, error } = await supabaseAdmin
    .from("private_pay_invoices")
    .select(INVOICE_COLUMNS)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });
  if (error || !invoices || invoices.length === 0) return [];
  return attachItemsAndPayments(invoices as PrivatePayInvoice[]);
}

export async function listActiveServiceTemplates(): Promise<PrivatePayServiceTemplate[]> {
  const { data } = await supabaseAdmin
    .from("private_pay_service_templates")
    .select("id, name, service_type, default_unit_label, default_unit_amount_cents, active, created_at")
    .eq("active", true)
    .order("name", { ascending: true });
  return (data ?? []) as PrivatePayServiceTemplate[];
}

export async function markInvoiceSent(invoiceId: string): Promise<void> {
  await supabaseAdmin
    .from("private_pay_invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent"]);
}

export async function voidInvoice(invoiceId: string): Promise<void> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid" || invoice.status === "refunded") {
    throw new Error("Paid invoices cannot be voided.");
  }
  const { error } = await supabaseAdmin
    .from("private_pay_invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

function invoiceHasStripePayment(invoice: PrivatePayInvoiceWithItems): boolean {
  if ((invoice.stripe_payment_intent_id ?? "").trim()) return true;
  return invoice.payments.some(
    (p) => p.status === "succeeded" && Boolean((p.stripe_payment_intent_id ?? "").trim())
  );
}

/** Resolve invoice id from a Stripe Checkout session id (webhook fallback). */
export async function getInvoiceIdByCheckoutSessionId(sessionId: string): Promise<string | null> {
  const trimmed = (sessionId ?? "").trim();
  if (!trimmed) return null;
  const { data } = await supabaseAdmin
    .from("private_pay_invoices")
    .select("id")
    .eq("stripe_checkout_session_id", trimmed)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Permanently delete a local invoice and cascaded records (items, payments, reports).
 * Blocks invoices with a succeeded Stripe payment on record.
 */
export async function hardDeleteInvoice(invoiceId: string): Promise<void> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoiceHasStripePayment(invoice)) {
    throw new Error(
      "This invoice has a Stripe payment on record and cannot be permanently deleted. Void or archive it instead."
    );
  }

  const { error } = await supabaseAdmin.from("private_pay_invoices").delete().eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

export async function markInvoicePaidManually(
  invoiceId: string,
  opts: {
    method: PrivatePayPaymentMethod;
    amountCents?: number;
    paidAt?: string | null;
    reference?: string | null;
    note?: string | null;
  },
  createdBy: string | null
): Promise<void> {
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") throw new Error("Invoice is already paid.");
  if (invoice.status === "void") throw new Error("Voided invoices cannot be paid.");

  const amount = opts.amountCents && opts.amountCents > 0 ? opts.amountCents : invoice.total_cents;
  if (amount > invoice.total_cents) {
    throw new Error(
      `Amount received cannot exceed the invoice balance of ${(invoice.total_cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}.`
    );
  }

  // Honor an admin-entered payment date; fall back to now. Stored as ISO.
  let paidAt = new Date().toISOString();
  if (opts.paidAt) {
    const parsed = new Date(opts.paidAt);
    if (!Number.isNaN(parsed.getTime())) paidAt = parsed.toISOString();
  }

  const { error: paymentError } = await supabaseAdmin.from("private_pay_payments").insert({
    invoice_id: invoiceId,
    amount_cents: amount,
    payment_method: opts.method,
    status: "succeeded",
    payment_reference: (opts.reference ?? "").trim() || null,
    notes: (opts.note ?? "").trim() || null,
    paid_at: paidAt,
    created_by: createdBy,
  });
  if (paymentError) throw new Error(paymentError.message);

  const { error: invoiceError } = await supabaseAdmin
    .from("private_pay_invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId);
  if (invoiceError) throw new Error(invoiceError.message);

  await markPaymentReportsReviewedForInvoice(invoiceId);
}

export async function createPendingCardPayment(opts: {
  invoiceId: string;
  customerId: string;
  amountCents: number;
  stripePaymentMethodId: string;
  createdBy: string | null;
}): Promise<PrivatePayPayment> {
  const { data, error } = await supabaseAdmin
    .from("private_pay_payments")
    .insert({
      invoice_id: opts.invoiceId,
      customer_id: opts.customerId,
      amount_cents: opts.amountCents,
      payment_method: "card",
      status: "pending",
      stripe_payment_method_id: opts.stripePaymentMethodId,
      created_by: opts.createdBy,
    })
    .select(PAYMENT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create pending payment.");
  }
  return data as PrivatePayPayment;
}

/**
 * Idempotently record a successful Stripe payment and mark the invoice paid.
 * Safe to call multiple times for the same PaymentIntent (webhook retries).
 */
export async function recordStripePaymentSucceeded(opts: {
  invoiceId: string;
  amountCents: number;
  stripePaymentIntentId: string;
  stripeChargeId?: string | null;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  customerId?: string | null;
  stripePaymentMethodId?: string | null;
  pendingPaymentId?: string | null;
}): Promise<void> {
  const invoiceBefore = await getInvoiceWithItems(opts.invoiceId);
  const wasAlreadyPaid = invoiceBefore?.status === "paid";
  const paidAt = new Date().toISOString();

  if (opts.pendingPaymentId) {
    await supabaseAdmin
      .from("private_pay_payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: opts.stripePaymentIntentId,
        stripe_charge_id: opts.stripeChargeId ?? null,
        card_brand: opts.cardBrand ?? null,
        card_last4: opts.cardLast4 ?? null,
        paid_at: paidAt,
        failure_message: null,
      })
      .eq("id", opts.pendingPaymentId);
  }

  const { data: existing } = await supabaseAdmin
    .from("private_pay_payments")
    .select("id, status")
    .eq("stripe_payment_intent_id", opts.stripePaymentIntentId)
    .eq("status", "succeeded")
    .maybeSingle();

  if (!existing) {
    const { error: paymentError } = await supabaseAdmin.from("private_pay_payments").insert({
      invoice_id: opts.invoiceId,
      amount_cents: opts.amountCents,
      payment_method: "card",
      status: "succeeded",
      stripe_payment_intent_id: opts.stripePaymentIntentId,
      stripe_charge_id: opts.stripeChargeId ?? null,
      card_brand: opts.cardBrand ?? null,
      card_last4: opts.cardLast4 ?? null,
      customer_id: opts.customerId ?? null,
      stripe_payment_method_id: opts.stripePaymentMethodId ?? null,
      paid_at: paidAt,
    });
    // Unique index may race with a concurrent retry — ignore duplicate key errors.
    if (paymentError && !/duplicate key|unique/i.test(paymentError.message)) {
      throw new Error(paymentError.message);
    }
  }

  await supabaseAdmin
    .from("private_pay_payments")
    .update({ status: "failed" })
    .eq("invoice_id", opts.invoiceId)
    .eq("status", "pending")
    .eq("payment_method", "card");

  await supabaseAdmin
    .from("private_pay_invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      stripe_payment_intent_id: opts.stripePaymentIntentId,
      stripe_customer_id: opts.stripeCustomerId ?? undefined,
      stripe_checkout_session_id: opts.stripeCheckoutSessionId ?? undefined,
    })
    .eq("id", opts.invoiceId)
    .neq("status", "refunded");

  await markPaymentReportsReviewedForInvoice(opts.invoiceId);

  if (!wasAlreadyPaid && invoiceBefore) {
    const customerName = (invoiceBefore.billing_name ?? "").trim() || "Customer";
    void notifyPrivatePayInvoicePaid({
      invoiceId: opts.invoiceId,
      invoiceNumber: invoiceBefore.invoice_number,
      customerName,
      amountCents: opts.amountCents,
      stripePaymentIntentId: opts.stripePaymentIntentId,
    }).catch((e) => {
      console.warn("[private-pay] admin payment notification failed", e);
    });
  }
}

export async function recordStripePaymentFailed(opts: {
  invoiceId: string;
  amountCents: number;
  stripePaymentIntentId?: string | null;
  failureMessage: string;
  customerId?: string | null;
  stripePaymentMethodId?: string | null;
  pendingPaymentId?: string | null;
}): Promise<void> {
  if (opts.pendingPaymentId) {
    await supabaseAdmin
      .from("private_pay_payments")
      .update({
        status: "failed",
        stripe_payment_intent_id: opts.stripePaymentIntentId ?? null,
        failure_message: opts.failureMessage,
      })
      .eq("id", opts.pendingPaymentId);
    return;
  }

  await supabaseAdmin.from("private_pay_payments").insert({
    invoice_id: opts.invoiceId,
    amount_cents: opts.amountCents,
    payment_method: "card",
    status: "failed",
    stripe_payment_intent_id: opts.stripePaymentIntentId ?? null,
    failure_message: opts.failureMessage,
    customer_id: opts.customerId ?? null,
    stripe_payment_method_id: opts.stripePaymentMethodId ?? null,
  });
}

export async function attachCheckoutSession(
  invoiceId: string,
  opts: { sessionId: string; customerId?: string | null }
): Promise<void> {
  await supabaseAdmin
    .from("private_pay_invoices")
    .update({
      stripe_checkout_session_id: opts.sessionId,
      stripe_customer_id: opts.customerId ?? undefined,
      status: "sent",
    })
    .eq("id", invoiceId)
    .in("status", ["draft", "sent"]);
}
