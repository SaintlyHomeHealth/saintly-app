"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { formatSsnDisplay, maskSsnIdentifier } from "@/lib/crm/ssn-mask";

type Props = {
  defaultValue: string;
};

export function LeadSsnRevealField({ defaultValue }: Props) {
  const [show, setShow] = useState(false);
  const digits = defaultValue.replace(/\D/g, "");
  const display = show && digits ? formatSsnDisplay(digits) : maskSsnIdentifier(digits);

  if (!digits) return null;

  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Social Security Number</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-900">
        <span className="font-mono tabular-nums">{display || "—"}</span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
          {show ? "Mask" : "Reveal"}
        </button>
      </dd>
    </div>
  );
}
