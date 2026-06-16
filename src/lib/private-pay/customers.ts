import "server-only";

import type Stripe from "stripe";

import { supabaseAdmin } from "@/lib/admin";
import { getStripe } from "@/lib/private-pay/stripe";
import type { PrivatePayPaymentMethodOnFile } from "@/lib/private-pay/types";

export type PrivatePayCustomer = {
  id: string;
  contact_id: string;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
};

const CUSTOMER_COLUMNS = "id, contact_id, stripe_customer_id, created_at, updated_at";

const PAYMENT_METHOD_COLUMNS =
  "id, customer_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default, consent_collected_at, created_at";

type ContactBilling = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function getPrivatePayCustomerByContactId(contactId: string): Promise<PrivatePayCustomer | null> {
  const { data } = await supabaseAdmin
    .from("private_pay_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("contact_id", contactId)
    .maybeSingle();
  return (data as PrivatePayCustomer | null) ?? null;
}

export async function getPrivatePayCustomerById(customerId: string): Promise<PrivatePayCustomer | null> {
  const { data } = await supabaseAdmin
    .from("private_pay_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", customerId)
    .maybeSingle();
  return (data as PrivatePayCustomer | null) ?? null;
}

/** Create or return the private-pay customer row for a CRM contact. */
export async function ensurePrivatePayCustomer(contactId: string): Promise<PrivatePayCustomer> {
  const existing = await getPrivatePayCustomerByContactId(contactId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("private_pay_customers")
    .insert({ contact_id: contactId })
    .select(CUSTOMER_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create private-pay customer.");
  }
  return data as PrivatePayCustomer;
}

/** Ensure a Stripe Customer exists and is linked to our private_pay_customers row. */
export async function ensureStripeCustomerForContact(
  contactId: string,
  billing?: ContactBilling
): Promise<{ customer: PrivatePayCustomer; stripeCustomerId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");

  const customer = await ensurePrivatePayCustomer(contactId);
  if (customer.stripe_customer_id) {
    return { customer, stripeCustomerId: customer.stripe_customer_id };
  }

  const stripeCustomer = await stripe.customers.create({
    email: (billing?.email ?? "").trim() || undefined,
    name: (billing?.name ?? "").trim() || undefined,
    phone: (billing?.phone ?? "").trim() || undefined,
    metadata: {
      saintly_private_pay: "true",
      contact_id: contactId,
      private_pay_customer_id: customer.id,
    },
  });

  const { data, error } = await supabaseAdmin
    .from("private_pay_customers")
    .update({ stripe_customer_id: stripeCustomer.id })
    .eq("id", customer.id)
    .select(CUSTOMER_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save Stripe customer ID.");
  }

  return { customer: data as PrivatePayCustomer, stripeCustomerId: stripeCustomer.id };
}

export async function listPaymentMethodsForContact(contactId: string): Promise<PrivatePayPaymentMethodOnFile[]> {
  const customer = await getPrivatePayCustomerByContactId(contactId);
  if (!customer) return [];

  const { data } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("customer_id", customer.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as PrivatePayPaymentMethodOnFile[];
}

export async function listPaymentMethodsForCustomer(customerId: string): Promise<PrivatePayPaymentMethodOnFile[]> {
  const { data } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as PrivatePayPaymentMethodOnFile[];
}

export async function getPaymentMethodById(paymentMethodId: string): Promise<PrivatePayPaymentMethodOnFile | null> {
  const { data } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("id", paymentMethodId)
    .maybeSingle();
  return (data as PrivatePayPaymentMethodOnFile | null) ?? null;
}

export async function getPaymentMethodByStripeId(
  stripePaymentMethodId: string
): Promise<PrivatePayPaymentMethodOnFile | null> {
  const { data } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .select(PAYMENT_METHOD_COLUMNS)
    .eq("stripe_payment_method_id", stripePaymentMethodId)
    .maybeSingle();
  return (data as PrivatePayPaymentMethodOnFile | null) ?? null;
}

function cardMetaFromStripePm(pm: Stripe.PaymentMethod): {
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
} {
  const card = pm.card;
  return {
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    exp_month: card?.exp_month ?? null,
    exp_year: card?.exp_year ?? null,
  };
}

/** Upsert a saved card row from a Stripe PaymentMethod (never stores PAN). */
export async function upsertPaymentMethodFromStripe(
  customerId: string,
  stripePaymentMethodId: string,
  opts?: { consentCollectedAt?: string; makeDefault?: boolean }
): Promise<PrivatePayPaymentMethodOnFile> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
  if (pm.type !== "card" || !pm.card) {
    throw new Error("Only card payment methods can be saved.");
  }

  const meta = cardMetaFromStripePm(pm);
  const consentAt = opts?.consentCollectedAt ?? new Date().toISOString();

  const existing = await getPaymentMethodByStripeId(stripePaymentMethodId);
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("private_pay_payment_methods")
      .update({
        brand: meta.brand,
        last4: meta.last4,
        exp_month: meta.exp_month,
        exp_year: meta.exp_year,
        consent_collected_at: existing.consent_collected_at ?? consentAt,
      })
      .eq("id", existing.id)
      .select(PAYMENT_METHOD_COLUMNS)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to update payment method.");
    if (opts?.makeDefault) await setDefaultPaymentMethod(existing.id);
    return data as PrivatePayPaymentMethodOnFile;
  }

  const makeDefault = opts?.makeDefault ?? true;
  if (makeDefault) {
    await supabaseAdmin
      .from("private_pay_payment_methods")
      .update({ is_default: false })
      .eq("customer_id", customerId);
  }

  const { data, error } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .insert({
      customer_id: customerId,
      stripe_payment_method_id: stripePaymentMethodId,
      brand: meta.brand,
      last4: meta.last4,
      exp_month: meta.exp_month,
      exp_year: meta.exp_year,
      is_default: makeDefault,
      consent_collected_at: consentAt,
    })
    .select(PAYMENT_METHOD_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save payment method.");
  return data as PrivatePayPaymentMethodOnFile;
}

export async function setDefaultPaymentMethod(paymentMethodId: string): Promise<PrivatePayPaymentMethodOnFile> {
  const pm = await getPaymentMethodById(paymentMethodId);
  if (!pm) throw new Error("Payment method not found.");

  await supabaseAdmin
    .from("private_pay_payment_methods")
    .update({ is_default: false })
    .eq("customer_id", pm.customer_id);

  const { data, error } = await supabaseAdmin
    .from("private_pay_payment_methods")
    .update({ is_default: true })
    .eq("id", paymentMethodId)
    .select(PAYMENT_METHOD_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to set default card.");
  return data as PrivatePayPaymentMethodOnFile;
}

export async function removePaymentMethod(paymentMethodId: string): Promise<void> {
  const pm = await getPaymentMethodById(paymentMethodId);
  if (!pm) throw new Error("Payment method not found.");

  const stripe = getStripe();
  if (stripe) {
    try {
      await stripe.paymentMethods.detach(pm.stripe_payment_method_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to detach card from Stripe.";
      if (!/already been detached|No such PaymentMethod/i.test(message)) {
        throw new Error(message);
      }
    }
  }

  await supabaseAdmin.from("private_pay_payment_methods").delete().eq("id", paymentMethodId);

  if (pm.is_default) {
    const remaining = await listPaymentMethodsForCustomer(pm.customer_id);
    if (remaining.length > 0) {
      await setDefaultPaymentMethod(remaining[0].id);
    }
  }
}

export async function removePaymentMethodByStripeId(stripePaymentMethodId: string): Promise<void> {
  const pm = await getPaymentMethodByStripeId(stripePaymentMethodId);
  if (pm) {
    await supabaseAdmin.from("private_pay_payment_methods").delete().eq("id", pm.id);
    if (pm.is_default) {
      const remaining = await listPaymentMethodsForCustomer(pm.customer_id);
      if (remaining.length > 0) {
        await setDefaultPaymentMethod(remaining[0].id);
      }
    }
  }
}

export async function contactHasCardOnFile(contactId: string): Promise<boolean> {
  const methods = await listPaymentMethodsForContact(contactId);
  return methods.length > 0;
}
