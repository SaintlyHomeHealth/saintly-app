"use client";

import { useState } from "react";

export function PayButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/private-pay/public/${token}/checkout`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        throw new Error(json.error || "Unable to start secure payment. Please try again.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={startCheckout}
        disabled={busy}
        className="w-full rounded-xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-60"
      >
        {busy ? "Opening secure checkout…" : "Pay securely by card or Apple Pay"}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500">
        Payments are processed securely by Stripe. Saintly never sees your full card number.
      </p>
      {error ? <p className="mt-3 text-center text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
