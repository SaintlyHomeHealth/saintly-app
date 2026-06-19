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
    <div className="mt-3">
      <button
        type="button"
        onClick={startCheckout}
        disabled={busy}
        className="w-full rounded-xl border border-slate-300 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:opacity-60"
      >
        {busy ? "Opening secure checkout…" : "Pay securely"}
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Processed securely by Stripe.
      </p>
      {error ? <p className="mt-2 text-center text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
