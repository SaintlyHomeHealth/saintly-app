"use client";

import { useMemo, useState } from "react";

import { ALL_PAYER_NAME_SUGGESTIONS, mergePayerNameSuggestions } from "@/lib/crm/payer-options";

type Props = {
  name?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string | null;
  /** Controlled value — when set, `onValueChange` should update it. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  id?: string;
  /** Placeholder on the text input (defaults to search hint). */
  placeholder?: string;
  /** Datalist suggestions; defaults to the full union for patient / legacy intake. */
  options?: readonly string[];
};

/**
 * Payer field backed by centralized options: native `datalist` gives type-to-filter behavior;
 * users may still enter a custom label (stored in `payer_name` / `primary_payer_name` / etc.).
 */
export function SearchablePayerSelect({
  name = "payer_name",
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  id = "payer_name",
  placeholder = "Search or type a payer…",
  options = ALL_PAYER_NAME_SUGGESTIONS,
}: Props) {
  const listId = `${id.replace(/[^a-zA-Z0-9_-]/g, "")}-payer-datalist`;
  const [uncontrolled, setUncontrolled] = useState(() => (defaultValue ?? "").trim());
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolled;

  const setValue = (next: string) => {
    if (isControlled) onValueChange?.(next);
    else setUncontrolled(next);
  };

  const datalistOptions = useMemo(() => mergePayerNameSuggestions(options, value), [options, value]);

  return (
    <>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={listId}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {datalistOptions.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
