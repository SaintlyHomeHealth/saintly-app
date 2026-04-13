"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";

import { maskMedicareIdentifier } from "@/lib/crm/medicare-mask";

const inpCls = "mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

type Props = {
  defaultNumber: string;
  defaultEffectiveDate: string;
  defaultNotes: string;
};

export function LeadMedicareFields(props: Props) {
  const { defaultNumber, defaultEffectiveDate, defaultNotes } = props;
  const [showMbi, setShowMbi] = useState(false);
  const [mbi, setMbi] = useState(defaultNumber);

  const displayVal = showMbi ? mbi : mbi ? maskMedicareIdentifier(mbi) : "";

  const onMbiChange = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^\dA-Za-z]/g, "").slice(0, 25);
      setMbi(cleaned);
    },
    []
  );

  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 rounded-xl border border-teal-100/90 bg-teal-50/30 p-4 ring-1 ring-teal-100/50">
        <p className="text-xs font-semibold text-teal-950">Medicare (typed entry)</p>
        <p className="mt-1 text-[11px] leading-snug text-teal-900/90">
          Enter the 11-character Medicare Beneficiary Identifier (MBI) from the card when you have it. This is stored in
          the lead record for intake only — verify eligibility through your normal process.
        </p>
      </div>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Medicare number (MBI)
        <input type="hidden" name="medicare_number" value={mbi} readOnly />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            autoComplete="off"
            readOnly={!showMbi}
            value={showMbi ? mbi : displayVal}
            onFocus={() => setShowMbi(true)}
            onChange={(e) => onMbiChange(e.target.value)}
            className={`${inpCls} flex-1 font-mono text-sm tracking-wide`}
            placeholder="e.g. 1EG4TE5MK72"
            aria-label="Medicare number"
          />
          <button
            type="button"
            onClick={() => setShowMbi((s) => !s)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showMbi ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            {showMbi ? "Mask" : "Show"}
          </button>
        </div>
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
        Medicare effective date (optional)
        <input
          type="date"
          name="medicare_effective_date"
          defaultValue={defaultEffectiveDate}
          className={inpCls}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Medicare notes (optional)
        <textarea
          name="medicare_notes"
          rows={2}
          defaultValue={defaultNotes}
          className={inpCls}
          placeholder="e.g. Part A only, pending verification call…"
        />
      </label>
    </div>
  );
}
