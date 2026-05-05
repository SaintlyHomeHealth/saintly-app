"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { quickAddInsurancePayerAction } from "@/app/admin/crm/insurance-payer-actions";
import {
  type InsurancePayerListItem,
  insurancePayerOptionListHasNormalizedMatch,
  mergeInsurancePayerCatalogWithTypeOptions,
  sortInsurancePayerListItems,
} from "@/lib/crm/insurance-payers";

type Props = {
  name: string;
  id: string;
  className?: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Server-fetched catalog; updated locally after quick-add. */
  catalog: InsurancePayerListItem[];
  onCatalogChange: (next: InsurancePayerListItem[]) => void;
  typeOptions: readonly string[];
  /** Optional `leads.primary_payer_type` / `secondary_payer_type` value stored on new catalog rows. */
  structuredPayerType: string;
};

const ADD_ERR = "Could not add payer. Try again.";

export function LeadInsurancePayerCombobox({
  name,
  id: inputId,
  className,
  placeholder = "Search or type a payer…",
  value,
  onValueChange,
  catalog,
  onCatalogChange,
  typeOptions,
  structuredPayerType,
}: Props) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const mergedOptions = useMemo(
    () => mergeInsurancePayerCatalogWithTypeOptions(catalog, typeOptions),
    [catalog, typeOptions]
  );

  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return mergedOptions;
    return mergedOptions.filter((o) => o.toLowerCase().includes(q));
  }, [mergedOptions, q]);

  const showQuickAdd =
    value.trim().length > 0 && !insurancePayerOptionListHasNormalizedMatch(mergedOptions, value);

  const clearBlurTimeout = () => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
  };

  useEffect(() => {
    return () => clearBlurTimeout();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el || !open) return;
      if (e.target instanceof Node && !el.contains(e.target)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  const pickOption = (label: string) => {
    clearBlurTimeout();
    onValueChange(label);
    setAddError(null);
    close();
  };

  const onQuickAdd = async () => {
    const label = value.trim();
    if (!label || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await quickAddInsurancePayerAction(label, structuredPayerType.trim() || null);
      if (!res.ok) {
        setAddError(ADD_ERR);
        return;
      }
      const p = res.payer;
      onCatalogChange(sortInsurancePayerListItems([...catalog.filter((c) => c.id !== p.id), p]));
      pickOption(p.payer_name);
    } catch {
      setAddError(ADD_ERR);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        name={name}
        type="text"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        role="combobox"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          setAddError(null);
          setOpen(true);
        }}
        onFocus={() => {
          clearBlurTimeout();
          setOpen(true);
        }}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 180);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
      />
      {addError ? <p className="mt-1 text-[11px] text-rose-600">{addError}</p> : null}
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-52 w-full min-w-[12rem] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {filtered.length === 0 && !showQuickAdd ? (
            <li className="px-3 py-2 text-slate-500" role="presentation">
              No matches
            </li>
          ) : (
            filtered.map((opt) => (
              <li key={opt} role="presentation">
                <button
                  type="button"
                  role="option"
                  className="w-full px-3 py-2 text-left hover:bg-slate-50"
                  aria-selected={value.trim().toLowerCase() === opt.trim().toLowerCase()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickOption(opt)}
                >
                  {opt}
                </button>
              </li>
            ))
          )}
          {showQuickAdd ? (
            <li role="presentation" className="border-t border-slate-100">
              <button
                type="button"
                disabled={adding}
                className="w-full px-3 py-2 text-left font-semibold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void onQuickAdd()}
              >
                {adding ? "Adding…" : `+ Add “${value.trim()}”`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
