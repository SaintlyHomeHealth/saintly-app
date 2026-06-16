"use client";

import { useCallback, useState } from "react";

import { PRIVATE_PAY_CARD_CONSENT_TEXT } from "@/lib/private-pay/card-consent";
import { formatSavedCardLabel } from "@/lib/private-pay/payment-badges";
import type { PrivatePayPaymentMethodOnFile } from "@/lib/private-pay/types";

const btnCls =
  "rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 whitespace-nowrap";

export function PrivatePayPaymentMethodsCard({
  contactId,
  contactName,
  initialMethods,
  canManage,
}: {
  contactId: string;
  contactName: string;
  initialMethods: PrivatePayPaymentMethodOnFile[];
  canManage: boolean;
}) {
  const [methods, setMethods] = useState(initialMethods);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"add" | "send_link" | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/private-pay/customers/${contactId}/payment-methods`);
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      paymentMethods?: PrivatePayPaymentMethodOnFile[];
    };
    if (json.ok && json.paymentMethods) setMethods(json.paymentMethods);
  }, [contactId]);

  const runWithConsent = async (action: "add" | "send_link") => {
    setPendingAction(action);
    setConsentOpen(true);
  };

  const confirmConsent = async () => {
    if (!pendingAction) return;
    setConsentOpen(false);
    setBusyId("action");
    setBanner(null);
    try {
      if (pendingAction === "add") {
        const res = await fetch(`/api/private-pay/customers/${contactId}/card-setup`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !json.ok || !json.url) throw new Error(json.error || "Failed to start card setup");
        window.open(json.url, "_blank", "noopener,noreferrer");
        setBanner({ kind: "ok", text: "Stripe card setup opened in a new tab. Refresh after completing." });
      } else {
        const res = await fetch(`/api/private-pay/customers/${contactId}/send-card-auth-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "text" }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          sentTo?: string;
          error?: string;
        };
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed to send link");
        setBanner({ kind: "ok", text: `Card authorization link sent to ${json.sentTo ?? "customer"}.` });
      }
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  };

  const setDefault = async (id: string) => {
    setBusyId(id);
    setBanner(null);
    try {
      const res = await fetch(`/api/private-pay/payment-methods/${id}/set-default`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to set default");
      await refresh();
      setBanner({ kind: "ok", text: "Default card updated." });
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusyId(null);
    }
  };

  const removeCard = async (id: string, last4: string | null) => {
    if (!window.confirm(`Remove card ending in ${last4 ?? "????"}?`)) return;
    setBusyId(id);
    setBanner(null);
    try {
      const res = await fetch(`/api/private-pay/payment-methods/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to remove card");
      await refresh();
      setBanner({ kind: "ok", text: "Card removed." });
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Payment methods</h2>
          <p className="mt-1 text-xs text-slate-500">
            Saved cards for {contactName}. Card numbers are stored by Stripe — we only keep brand, last 4, and expiration.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => runWithConsent("add")}
              className={`${btnCls} border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100`}
            >
              Add card on file
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => runWithConsent("send_link")}
              className={`${btnCls} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Send card authorization link
            </button>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => refresh()}
              className={`${btnCls} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>

      {banner ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            banner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {methods.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No card on file yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {methods.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {formatSavedCardLabel(m.brand, m.last4, m.exp_month, m.exp_year)}
                </p>
                {m.is_default ? (
                  <span className="mt-1 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-900">
                    Default
                  </span>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {!m.is_default ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => setDefault(m.id)}
                      className={`${btnCls} border-slate-300 bg-white text-slate-700`}
                    >
                      Set default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => removeCard(m.id, m.last4)}
                    className={`${btnCls} border-rose-300 bg-white text-rose-700`}
                  >
                    Remove card
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {consentOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">Card authorization consent</h3>
            <p className="mt-3 text-sm text-slate-700">{PRIVATE_PAY_CARD_CONSENT_TEXT}</p>
            <p className="mt-2 text-xs text-slate-500">
              Confirm that the customer has agreed before saving a card for future off-session charges.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConsentOpen(false);
                  setPendingAction(null);
                }}
                className={`${btnCls} border-slate-300 bg-white text-slate-700`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmConsent()}
                className={`${btnCls} border-sky-600 bg-sky-600 text-white hover:bg-sky-700`}
              >
                Customer authorized — continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
