"use client";

import { useState } from "react";

import { ARIZONA_PAYER_OPTIONS } from "@/lib/crm/payer-options";

type Props = {
  name?: string;
  defaultValue?: string | null;
  className?: string;
  id?: string;
};

/**
 * Payer field backed by centralized options: native `datalist` gives type-to-filter behavior;
 * users may still enter a custom label (stored in `payer_name`).
 */
export function SearchablePayerSelect({
  name = "payer_name",
  defaultValue,
  className,
  id = "payer_name",
}: Props) {
  const listId = `${id.replace(/[^a-zA-Z0-9_-]/g, "")}-payer-datalist`;
  const [value, setValue] = useState((defaultValue ?? "").trim());

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
        placeholder="Search or type a payer…"
        className={className}
      />
      <datalist id={listId}>
        {ARIZONA_PAYER_OPTIONS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}
