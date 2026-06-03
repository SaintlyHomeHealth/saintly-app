import type {
  PrivatePayInvoiceStatus,
  PrivatePayPaymentMethod,
  PrivatePayServiceType,
  PrivatePayUnitLabel,
} from "@/lib/private-pay/constants";

export type PrivatePayInvoiceItem = {
  id: string;
  invoice_id: string;
  service_type: PrivatePayServiceType;
  description: string | null;
  service_date: string | null;
  quantity: number;
  unit_label: PrivatePayUnitLabel;
  unit_amount_cents: number;
  line_total_cents: number;
  sort_order: number;
  created_at: string;
};

export type PrivatePayPayment = {
  id: string;
  invoice_id: string;
  receipt_number: string | null;
  amount_cents: number;
  payment_method: PrivatePayPaymentMethod;
  status: "pending" | "succeeded" | "failed" | "refunded";
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  notes: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type PrivatePayInvoice = {
  id: string;
  contact_id: string | null;
  patient_id: string | null;
  lead_id: string | null;
  invoice_number: string;
  status: PrivatePayInvoiceStatus;
  billing_name: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivatePayInvoiceWithItems = PrivatePayInvoice & {
  items: PrivatePayInvoiceItem[];
  payments: PrivatePayPayment[];
};

export type PrivatePayServiceTemplate = {
  id: string;
  name: string;
  service_type: PrivatePayServiceType;
  default_unit_label: PrivatePayUnitLabel;
  default_unit_amount_cents: number;
  active: boolean;
  created_at: string;
};

/** Shape posted by the new-invoice modal. */
export type PrivatePayInvoiceItemInput = {
  service_type: PrivatePayServiceType;
  description?: string | null;
  service_date?: string | null;
  quantity: number;
  unit_label: PrivatePayUnitLabel;
  unit_amount_cents: number;
};

/** Enriched row for the admin Private Pay list page. */
export type PrivatePayInvoiceListRow = PrivatePayInvoiceWithItems & {
  customer_name: string;
  customer_detail: string | null;
  profile_href: string | null;
};

/** CRM person selected when creating an invoice from /admin/private-pay. */
export type PrivatePayRecipient = {
  contact_id: string;
  patient_id: string | null;
  lead_id: string | null;
  kind: "contact" | "patient" | "lead";
  label: string;
  billing: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
};

export type PrivatePayRecipientSearchResult = {
  contacts: PrivatePayRecipient[];
  patients: PrivatePayRecipient[];
  leads: PrivatePayRecipient[];
};

export type PrivatePayInvoiceInput = {
  contact_id?: string | null;
  patient_id?: string | null;
  lead_id?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address?: string | null;
  discount_cents?: number;
  tax_cents?: number;
  notes?: string | null;
  items: PrivatePayInvoiceItemInput[];
};
