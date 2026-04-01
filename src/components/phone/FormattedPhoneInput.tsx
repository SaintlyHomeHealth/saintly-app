"use client";

import { useEffect, useState } from "react";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";

type Props = {
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
  id?: string;
  autoComplete?: string;
  placeholder?: string;
};

/**
 * Shows NANP-style formatting while typing; submits digits-only via a hidden input (same `name` for FormData).
 */
export function FormattedPhoneInput({
  name,
  defaultValue = "",
  required,
  className,
  id,
  autoComplete,
  placeholder = "(555) 555-1234",
}: Props) {
  const [display, setDisplay] = useState(() => formatPhoneNumber(defaultValue ?? ""));

  useEffect(() => {
    setDisplay(formatPhoneNumber(defaultValue ?? ""));
  }, [defaultValue]);

  const digits = normalizePhone(display);

  return (
    <>
      <input type="hidden" name={name} value={digits} />
      <input
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        id={id}
        required={required}
        value={display}
        onChange={(e) => setDisplay(formatPhoneNumber(e.target.value))}
        className={className}
        placeholder={placeholder}
      />
    </>
  );
}
