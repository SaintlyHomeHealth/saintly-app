"use client";

import { useEffect, useState } from "react";

import type { PrivatePaySettingsInput } from "@/lib/private-pay/payment-settings";

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-slate-300"
      />
    </label>
  );
}

export function PrivatePayPaymentSettingsModal({
  open,
  initialSettings,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialSettings: PrivatePaySettingsInput;
  onClose: () => void;
  onSaved: (settings: PrivatePaySettingsInput) => void;
}) {
  const [form, setForm] = useState<PrivatePaySettingsInput>(initialSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setForm(initialSettings);
  }, [open, initialSettings]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/private-pay/settings")
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: PrivatePaySettingsInput;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.settings) {
          throw new Error(json.error || "Failed to load settings");
        }
        if (!cancelled) setForm(json.settings);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function set<K extends keyof PrivatePaySettingsInput>(key: K, value: PrivatePaySettingsInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/private-pay/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        settings?: PrivatePaySettingsInput;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.settings) throw new Error(json.error || "Failed to save settings");
      onSaved(json.settings);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Payment settings</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Zelle, Cash App, Apple Cash, and check instructions shown on invoices and the customer pay page.
              Changes apply immediately — no redeploy needed.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span className="font-semibold">Default preferred payment:</span> Zelle
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading settings…</p>
        ) : (
          <div className="mt-5 space-y-6">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Zelle</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Recipient name</label>
                  <input
                    value={form.zelle_name}
                    onChange={(e) => set("zelle_name", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Phone</label>
                  <input
                    value={form.zelle_phone}
                    onChange={(e) => set("zelle_phone", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Email</label>
                  <input
                    value={form.zelle_email}
                    onChange={(e) => set("zelle_email", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Cash App</h3>
              <div className="mt-2">
                <label className="text-xs font-semibold text-slate-600">Cashtag</label>
                <input
                  value={form.cashapp_tag}
                  onChange={(e) => set("cashapp_tag", e.target.value)}
                  disabled={busy}
                  placeholder="$YourCashtag"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Apple Cash</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Phone</label>
                  <input
                    value={form.apple_cash_phone}
                    onChange={(e) => set("apple_cash_phone", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Email</label>
                  <input
                    value={form.apple_cash_email}
                    onChange={(e) => set("apple_cash_email", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Cash / check</h3>
              <div className="mt-2 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Check payable to</label>
                  <input
                    value={form.check_payable_to}
                    onChange={(e) => set("check_payable_to", e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Mailing / payment address</label>
                  <textarea
                    value={form.mailing_address}
                    onChange={(e) => set("mailing_address", e.target.value)}
                    disabled={busy}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Manual payment note</label>
                  <textarea
                    value={form.manual_note}
                    onChange={(e) => set("manual_note", e.target.value)}
                    disabled={busy}
                    rows={2}
                    placeholder="Optional note shown on invoices"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Show on invoice / pay page</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Toggle
                  label="Show Zelle"
                  checked={form.show_zelle}
                  onChange={(v) => set("show_zelle", v)}
                  disabled={busy}
                />
                <Toggle
                  label="Show Cash App"
                  checked={form.show_cashapp}
                  onChange={(v) => set("show_cashapp", v)}
                  disabled={busy}
                />
                <Toggle
                  label="Show Apple Cash"
                  checked={form.show_apple_cash}
                  onChange={(v) => set("show_apple_cash", v)}
                  disabled={busy}
                />
                <Toggle
                  label="Show cash / check"
                  checked={form.show_cash_check}
                  onChange={(v) => set("show_cash_check", v)}
                  disabled={busy}
                />
                <Toggle
                  label="Show Stripe card option"
                  checked={form.show_stripe}
                  onChange={(v) => set("show_stripe", v)}
                  disabled={busy}
                />
              </div>
            </section>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

        <p className="mt-4 text-[11px] text-slate-400">
          Empty fields can still fall back to Vercel env variables if set. Supabase values take priority when filled in.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || loading}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
