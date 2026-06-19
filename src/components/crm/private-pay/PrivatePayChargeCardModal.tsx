"use client";

import { useEffect, useRef, useState } from "react";
import type { Stripe, StripeCardElement } from "@stripe/stripe-js";

import { formatCentsUsd } from "@/lib/private-pay/format";
import { formatSavedCardLabel } from "@/lib/private-pay/payment-badges";
import { getStripeJs, isStripePublishableKeyConfigured } from "@/lib/private-pay/stripe-client";
import type {
  PrivatePayInvoiceWithItems,
  PrivatePayPaymentMethodOnFile,
} from "@/lib/private-pay/types";

export const PRIVATE_PAY_CARD_CONSENT_LABEL =
  "Client authorized Saintly Home Health LLC to charge this invoice and save this card on file for future private-pay charges.";

type ChargeSuccessPayload = {
  invoice: PrivatePayInvoiceWithItems;
  paymentMethods?: PrivatePayPaymentMethodOnFile[];
  message: string;
};

export function PrivatePayChargeCardModal({
  open,
  invoice,
  paymentMethods,
  contactId,
  busy,
  error,
  onClose,
  onSuccess,
}: {
  open: boolean;
  invoice: PrivatePayInvoiceWithItems | null;
  paymentMethods: PrivatePayPaymentMethodOnFile[];
  contactId?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSuccess: (payload: ChargeSuccessPayload) => void;
}) {
  if (!open || !invoice) return null;

  const hasSavedCard = paymentMethods.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        {hasSavedCard ? (
          <SavedCardChargeForm
            invoice={invoice}
            paymentMethods={paymentMethods}
            busy={busy}
            error={error}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        ) : (
          <NewCardChargeForm
            invoice={invoice}
            contactId={contactId ?? invoice.contact_id}
            busy={busy}
            error={error}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}

function InvoiceSummary({ invoice }: { invoice: PrivatePayInvoiceWithItems }) {
  const customerName = (invoice.billing_name ?? "").trim() || "Customer";
  return (
    <dl className="mt-4 space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Customer</dt>
        <dd className="font-medium text-slate-900">{customerName}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Invoice</dt>
        <dd className="font-medium text-slate-900">{invoice.invoice_number}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-slate-500">Amount due</dt>
        <dd className="font-semibold tabular-nums text-slate-900">{formatCentsUsd(invoice.total_cents)}</dd>
      </div>
    </dl>
  );
}

function SavedCardChargeForm({
  invoice,
  paymentMethods,
  busy,
  error,
  onClose,
  onSuccess,
}: {
  invoice: PrivatePayInvoiceWithItems;
  paymentMethods: PrivatePayPaymentMethodOnFile[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSuccess: (payload: ChargeSuccessPayload) => void;
}) {
  const defaultPm = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;
  const [selectedId, setSelectedId] = useState(defaultPm?.id ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;

  const selected = paymentMethods.find((m) => m.id === selectedId) ?? defaultPm;

  const charge = async () => {
    if (!selected) {
      setLocalError("No saved card selected.");
      return;
    }
    setLocalError(null);
    setAuthUrl(null);
    setLocalBusy(true);
    try {
      const res = await fetch(`/api/private-pay/invoices/${invoice.id}/charge-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method_id: selected.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        invoice?: PrivatePayInvoiceWithItems;
        message?: string;
        error?: string;
        authUrl?: string;
      };

      if (json.ok && json.invoice) {
        onSuccess({ invoice: json.invoice, message: json.message ?? "Card charged successfully." });
        return;
      }

      if (json.status === "requires_action") {
        setLocalError(json.error ?? "Authentication required.");
        setAuthUrl(json.authUrl ?? null);
        return;
      }

      setLocalError(json.error ?? "Card charge failed.");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLocalBusy(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <>
      <h3 className="text-base font-bold text-slate-900">Charge card</h3>
      <p className="mt-1 text-xs text-slate-500">Confirm before charging the customer&apos;s card on file.</p>
      <InvoiceSummary invoice={invoice} />

      {paymentMethods.length > 1 ? (
        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-600">Card on file</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {formatSavedCardLabel(m.brand, m.last4, m.exp_month, m.exp_year)}
                {m.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : selected ? (
        <p className="mt-4 text-sm text-slate-800">
          <span className="text-slate-500">Card on file: </span>
          {formatSavedCardLabel(selected.brand, selected.last4, selected.exp_month, selected.exp_year)}
        </p>
      ) : null}

      {displayError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {displayError}
        </p>
      ) : null}

      {authUrl ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Send secure payment link</p>
          <a href={authUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block underline">
            Open authentication checkout
          </a>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isBusy || !selected}
          onClick={() => void charge()}
          className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isBusy ? "Charging…" : "Charge card"}
        </button>
      </div>
    </>
  );
}

function NewCardChargeForm({
  invoice,
  contactId,
  busy,
  error,
  onClose,
  onSuccess,
}: {
  invoice: PrivatePayInvoiceWithItems;
  contactId: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSuccess: (payload: ChargeSuccessPayload) => void;
}) {
  const cardMountRef = useRef<HTMLDivElement>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);

  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;

  useEffect(() => {
    if (!isStripePublishableKeyConfigured()) return;

    let cancelled = false;
    let cardElement: StripeCardElement | null = null;

    void (async () => {
      const stripe = await getStripeJs();
      if (cancelled || !stripe || !cardMountRef.current) return;

      stripeRef.current = stripe;
      const elements = stripe.elements();
      cardElement = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#0f172a",
            "::placeholder": { color: "#94a3b8" },
          },
          invalid: { color: "#be123c" },
        },
      });
      cardElement.mount(cardMountRef.current);
      cardElement.on("ready", () => {
        if (!cancelled) setReady(true);
      });
      cardElementRef.current = cardElement;
    })();

    return () => {
      cancelled = true;
      cardElement?.destroy();
      cardElementRef.current = null;
      setReady(false);
    };
  }, []);

  const finalizeCharge = async (paymentIntentId: string) => {
    const res = await fetch(`/api/private-pay/invoices/${invoice.id}/charge-new-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finalize: true,
        payment_intent_id: paymentIntentId,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: string;
      invoice?: PrivatePayInvoiceWithItems;
      paymentMethods?: PrivatePayPaymentMethodOnFile[];
      message?: string;
      error?: string;
      clientSecret?: string;
      paymentIntentId?: string;
    };

    if (json.ok && json.invoice) {
      onSuccess({
        invoice: json.invoice,
        paymentMethods: json.paymentMethods,
        message: json.message ?? "Card charged and saved successfully.",
      });
      return;
    }

    if (json.status === "requires_action" && json.clientSecret && stripeRef.current) {
      const { error: confirmError, paymentIntent } = await stripeRef.current.confirmCardPayment(
        json.clientSecret
      );
      if (confirmError) {
        setLocalError(confirmError.message ?? "Card authentication failed.");
        return;
      }
      if (paymentIntent?.id) {
        await finalizeCharge(paymentIntent.id);
      }
      return;
    }

    setLocalError(json.error ?? "Card charge failed.");
  };

  const chargeAndSave = async () => {
    if (!contactId) {
      setLocalError("Link a contact to this invoice before charging and saving a card.");
      return;
    }
    if (!consent) {
      setLocalError("Client authorization is required before charging and saving the card.");
      return;
    }
    if (!isStripePublishableKeyConfigured()) {
      setLocalError("Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.");
      return;
    }

    const stripe = stripeRef.current ?? (await getStripeJs());
    const card = cardElementRef.current;
    if (!stripe || !card) {
      setLocalError("Secure card entry is not ready yet. Wait a moment and try again.");
      return;
    }

    setLocalError(null);
    setLocalBusy(true);

    try {
      const billingName = (invoice.billing_name ?? "").trim() || undefined;
      const billingEmail = (invoice.billing_email ?? "").trim() || undefined;
      const billingPhone = (invoice.billing_phone ?? "").trim() || undefined;

      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card,
        billing_details: {
          name: billingName,
          email: billingEmail,
          phone: billingPhone,
        },
      });

      if (pmError || !paymentMethod) {
        setLocalError(pmError?.message ?? "Could not tokenize the card.");
        return;
      }

      const res = await fetch(`/api/private-pay/invoices/${invoice.id}/charge-new-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripe_payment_method_id: paymentMethod.id,
          consent_authorized: true,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        invoice?: PrivatePayInvoiceWithItems;
        paymentMethods?: PrivatePayPaymentMethodOnFile[];
        message?: string;
        error?: string;
        clientSecret?: string;
        paymentIntentId?: string;
      };

      if (json.ok && json.invoice) {
        onSuccess({
          invoice: json.invoice,
          paymentMethods: json.paymentMethods,
          message: json.message ?? "Card charged and saved successfully.",
        });
        return;
      }

      if (json.status === "requires_action" && json.clientSecret) {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(json.clientSecret);
        if (confirmError) {
          setLocalError(confirmError.message ?? "Card authentication failed.");
          return;
        }
        if (paymentIntent?.id) {
          await finalizeCharge(paymentIntent.id);
        }
        return;
      }

      setLocalError(json.error ?? "Card charge failed.");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLocalBusy(false);
    }
  };

  const displayError = localError ?? error;

  if (!contactId) {
    return (
      <>
        <h3 className="text-base font-bold text-slate-900">Charge card</h3>
        <p className="mt-3 text-sm text-rose-800">
          This invoice has no linked contact. Attach a contact before entering a card to charge and save it on file.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Close
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="text-base font-bold text-slate-900">Charge card</h3>
      <p className="mt-1 text-xs text-slate-500">
        Enter the client&apos;s card securely through Stripe to charge this invoice and save the card on file. Card
        numbers are not stored by Saintly.
      </p>
      <InvoiceSummary invoice={invoice} />

      <div className="mt-4">
        <label className="text-xs font-semibold text-slate-600">Card details</label>
        <div
          ref={cardMountRef}
          className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-3"
          aria-label="Secure card entry"
        />
        {!isStripePublishableKeyConfigured() ? (
          <p className="mt-2 text-xs text-rose-700">Stripe publishable key is not configured.</p>
        ) : !ready ? (
          <p className="mt-2 text-xs text-slate-500">Loading secure card fields…</p>
        ) : null}
      </div>

      <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>{PRIVATE_PAY_CARD_CONSENT_LABEL}</span>
      </label>

      {displayError ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {displayError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isBusy || !consent || !ready}
          onClick={() => void chargeAndSave()}
          className="rounded-md border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isBusy ? "Processing…" : "Charge and save card"}
        </button>
      </div>
    </>
  );
}
