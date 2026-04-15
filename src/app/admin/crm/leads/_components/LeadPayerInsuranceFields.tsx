"use client";

import { useMemo, useState } from "react";

import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import {
  LEAD_STRUCTURED_PAYER_TYPES,
  isValidLeadStructuredPayerType,
  leadStructuredPayerTypeLabel,
} from "@/lib/crm/lead-payer-structured";
import {
  ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME,
  getPayerNameOptionsForLeadStructuredType,
} from "@/lib/crm/payer-options";

type Props = {
  inp: string;
  primaryPayerType: string;
  primaryPayerName: string;
  secondaryPayerType: string;
  secondaryPayerName: string;
  idPrefix: string;
};

export function LeadPayerInsuranceFields(props: Props) {
  const { inp, primaryPayerType, primaryPayerName, secondaryPayerType, secondaryPayerName, idPrefix } = props;

  const [primaryType, setPrimaryType] = useState(() => primaryPayerType.trim());
  const [secondaryType, setSecondaryType] = useState(() => secondaryPayerType.trim());

  const [primaryName, setPrimaryName] = useState(() => {
    const n = primaryPayerName.trim();
    const t = primaryPayerType.trim();
    if (n) return n;
    if (t === "original_medicare") return ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME;
    return "";
  });

  const [secondaryName, setSecondaryName] = useState(() => secondaryPayerName.trim());

  const legacyPrimaryType =
    primaryType.trim() && !isValidLeadStructuredPayerType(primaryType) ? primaryType.trim() : null;
  const legacySecondaryType =
    secondaryType.trim() && !isValidLeadStructuredPayerType(secondaryType) ? secondaryType.trim() : null;

  const primaryOptions = useMemo(() => getPayerNameOptionsForLeadStructuredType(primaryType), [primaryType]);
  const secondaryOptions = useMemo(() => getPayerNameOptionsForLeadStructuredType(secondaryType), [secondaryType]);

  const primaryNamePlaceholder = useMemo(() => {
    if (primaryType.trim() === "original_medicare") return "e.g. Medicare (Original Medicare)";
    return "Search or type a payer…";
  }, [primaryType]);

  return (
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Primary payer type
        <select
          name="primary_payer_type"
          id={`${idPrefix}-primary-type`}
          className={inp}
          value={primaryType}
          onChange={(e) => {
            const next = e.target.value;
            const prev = primaryType.trim();
            setPrimaryType(next);
            if (next.trim() === "original_medicare" && prev !== "original_medicare" && !primaryName.trim()) {
              setPrimaryName(ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME);
            }
          }}
        >
          <option value="">—</option>
          {LEAD_STRUCTURED_PAYER_TYPES.map((v) => (
            <option key={v} value={v}>
              {leadStructuredPayerTypeLabel(v)}
            </option>
          ))}
          {legacyPrimaryType ? (
            <option value={legacyPrimaryType}>
              {legacyPrimaryType} (legacy)
            </option>
          ) : null}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Primary payer name
        <SearchablePayerSelect
          name="primary_payer_name"
          value={primaryName}
          onValueChange={setPrimaryName}
          options={primaryOptions}
          className={inp}
          id={`${idPrefix}-primary-name`}
          placeholder={primaryNamePlaceholder}
        />
      </label>
      {primaryType.trim() === "original_medicare" ? (
        <p className="text-[11px] leading-snug text-slate-500 sm:col-span-2">
          For Original Medicare, the default label is <strong>{ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME}</strong>. Add the
          supplement or Medicaid crossover under secondary payer. You can override the primary name if needed.
        </p>
      ) : null}

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Secondary payer type <span className="font-normal text-slate-400">(optional)</span>
        <select
          name="secondary_payer_type"
          id={`${idPrefix}-secondary-type`}
          className={inp}
          value={secondaryType}
          onChange={(e) => setSecondaryType(e.target.value)}
        >
          <option value="">—</option>
          {LEAD_STRUCTURED_PAYER_TYPES.map((v) => (
            <option key={v} value={v}>
              {leadStructuredPayerTypeLabel(v)}
            </option>
          ))}
          {legacySecondaryType ? (
            <option value={legacySecondaryType}>
              {legacySecondaryType} (legacy)
            </option>
          ) : null}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Secondary payer name <span className="font-normal text-slate-400">(optional)</span>
        <SearchablePayerSelect
          name="secondary_payer_name"
          value={secondaryName}
          onValueChange={setSecondaryName}
          options={secondaryOptions}
          className={inp}
          id={`${idPrefix}-secondary-name`}
          placeholder="e.g. UnitedHealthcare"
        />
      </label>
    </div>
  );
}
