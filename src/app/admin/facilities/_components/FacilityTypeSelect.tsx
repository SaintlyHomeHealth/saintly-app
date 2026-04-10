"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  FACILITY_TYPE_DESCRIPTIONS,
  FACILITY_TYPE_OPTIONS,
  facilityTypeDropdownTitle,
  isValidFacilityType,
} from "@/lib/crm/facility-options";

type FacilityTypeSelectProps = {
  /** Form field name (submits canonical type value, e.g. LTACH). */
  name: string;
  /** Current value from URL or record (empty string = none). */
  defaultValue: string;
  /** First row when nothing selected (e.g. "All" or "Select type…"). */
  emptyLabel: string;
  /** Classes for the closed trigger (match existing filter / form inputs). */
  triggerClassName: string;
};

function describe(t: (typeof FACILITY_TYPE_OPTIONS)[number]): string | undefined {
  const d = FACILITY_TYPE_DESCRIPTIONS[t];
  return d?.trim() ? d : undefined;
}

export function FacilityTypeSelect({ name, defaultValue, emptyLabel, triggerClassName }: FacilityTypeSelectProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedTitle = (() => {
    if (!value.trim()) return emptyLabel;
    if (isValidFacilityType(value)) return facilityTypeDropdownTitle(value);
    return value;
  })();

  function pick(next: string) {
    setValue(next);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name={name} value={value} aria-hidden />
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 text-left ${triggerClassName}`}
      >
        <span className="min-w-0 flex-1 truncate text-slate-900">{selectedTitle}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-labelledby={id}
          className="absolute left-0 right-0 z-50 mt-1 max-h-[min(22rem,70vh)] divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white py-0 shadow-lg shadow-slate-200/40 ring-1 ring-slate-200/60"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            onClick={() => pick("")}
            className="flex w-full flex-col gap-0 px-3 py-2.5 text-left text-sm text-slate-900 hover:bg-sky-50/90"
          >
            {emptyLabel}
          </button>
          {FACILITY_TYPE_OPTIONS.map((t) => {
            const title = facilityTypeDropdownTitle(t);
            const desc = describe(t);
            const selected = value === t;
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(t)}
                className={`flex w-full flex-col gap-0 px-3 py-2.5 text-left hover:bg-sky-50/90 ${
                  selected ? "bg-sky-50/70" : ""
                }`}
              >
                <span className="text-sm font-normal leading-snug text-slate-900">{title}</span>
                {desc ? (
                  <span className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-slate-500">{desc}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
