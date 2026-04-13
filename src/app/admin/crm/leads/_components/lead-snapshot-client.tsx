"use client";

import { useCallback, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";

function maskMedicare(raw: string): { masked: string; last4: string } {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 4) {
    return { masked: "••••", last4: digits };
  }
  const last4 = digits.slice(-4);
  return { masked: `•••• •••• •••• ${last4}`, last4 };
}

export function LeadSnapshotMedicareReveal({ medicareNumber }: { medicareNumber: string }) {
  const trimmed = medicareNumber.trim();
  const [revealed, setRevealed] = useState(false);

  if (!trimmed) {
    return <span className="text-slate-400">Not provided</span>;
  }

  const { masked } = maskMedicare(trimmed);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono text-sm tabular-nums text-slate-900">{revealed ? trimmed : masked}</span>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        {revealed ? (
          <>
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
            Hide
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Reveal
          </>
        )}
      </button>
    </span>
  );
}

export function LeadSnapshotCopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden />
      {done ? "Copied" : "Copy summary"}
    </button>
  );
}
