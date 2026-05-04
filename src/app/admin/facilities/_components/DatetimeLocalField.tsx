"use client";

import { useEffect, useState } from "react";

import { toDatetimeLocalValue } from "@/lib/crm/facility-address";

type DatetimeLocalFieldProps = {
  name: string;
  defaultValueIso?: string | null;
  className?: string;
  required?: boolean;
  id?: string;
};

/**
 * Renders `datetime-local` using America/Phoenix (agency wall time), regardless of device locale.
 */
export function DatetimeLocalField({
  name,
  defaultValueIso,
  className = "",
  required,
  id,
}: DatetimeLocalFieldProps) {
  const [v, setV] = useState("");

  useEffect(() => {
    setV(defaultValueIso ? toDatetimeLocalValue(defaultValueIso) : "");
  }, [defaultValueIso]);

  return (
    <input
      id={id}
      type="datetime-local"
      name={name}
      value={v}
      onChange={(e) => setV(e.target.value)}
      className={className}
      required={required}
    />
  );
}
