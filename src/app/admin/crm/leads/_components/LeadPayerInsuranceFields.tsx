"use client";

import { useMemo, useState } from "react";

import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import {
  LEAD_STRUCTURED_PAYER_TYPES,
  isValidLeadStructuredPayerType,
  leadStructuredPayerTypeLabel,
} from "@/lib/crm/lead-payer-structured";

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

  const legacyPrimaryType =
    primaryType.trim() && !isValidLeadStructuredPayerType(primaryType) ? primaryType.trim() : null;
  const legacySecondaryType =
    secondaryPayerType.trim() && !isValidLeadStructuredPayerType(secondaryPayerType) ? secondaryPayerType.trim() : null;

  const primaryNamePlaceholder = useMemo(() => {
    if (primaryType.trim() === "original_medicare") return "e.g. Medicare Part A/B";
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
          onChange={(e) => setPrimaryType(e.target.value)}
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
          defaultValue={primaryPayerName}
          className={inp}
          id={`${idPrefix}-primary-name`}
          placeholder={primaryNamePlaceholder}
        />
      </label>
      {primaryType.trim() === "original_medicare" ? (
        <p className="text-[11px] leading-snug text-slate-500 sm:col-span-2">
          For Original Medicare, enter the member-facing label (often <strong>Medicare Part A/B</strong>). Add the
          supplement or Medicaid crossover under secondary payer.
        </p>
      ) : null}

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Secondary payer type <span className="font-normal text-slate-400">(optional)</span>
        <select
          name="secondary_payer_type"
          id={`${idPrefix}-secondary-type`}
          className={inp}
          defaultValue={secondaryPayerType.trim()}
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
          defaultValue={secondaryPayerName}
          className={inp}
          id={`${idPrefix}-secondary-name`}
          placeholder="e.g. UnitedHealthcare supplement"
        />
      </label>
    </div>
  );
}
