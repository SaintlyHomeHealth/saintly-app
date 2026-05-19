"use client";

import { useEffect, useState } from "react";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";

type Props = {
  name: string;
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (display: string) => void;
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
  value: controlledDisplay,
  onValueChange,
  required,
  className,
  id,
  autoComplete,
  placeholder = "(555) 555-1234",
}: Props) {
  const [internalDisplay, setInternalDisplay] = useState(() =>
    formatPhoneNumber(controlledDisplay ?? defaultValue ?? "")
  );
  const display = controlledDisplay ?? internalDisplay;
  const setDisplay = onValueChange ?? setInternalDisplay;

  useEffect(() => {
    if (controlledDisplay !== undefined) return;
    setInternalDisplay(formatPhoneNumber(defaultValue ?? ""));
  }, [controlledDisplay, defaultValue]);

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
