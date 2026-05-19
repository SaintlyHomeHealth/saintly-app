"use client";

import { useState } from "react";

/** Display MM/DD/YYYY; submit ISO YYYY-MM-DD via hidden input. */
export function FormattedDobInput({
  name,
  required,
  className,
  id,
  value: controlledDisplay,
  onValueChange,
}: {
  name: string;
  required?: boolean;
  className?: string;
  id?: string;
  value?: string;
  onValueChange?: (display: string) => void;
}) {
  const [internalDisplay, setInternalDisplay] = useState(controlledDisplay ?? "");
  const display = controlledDisplay ?? internalDisplay;
  const setDisplay = onValueChange ?? setInternalDisplay;

  const isoValue = parseDobDisplayToIso(display);

  return (
    <>
      <input type="hidden" name={name} value={isoValue} />
      <input
        type="text"
        inputMode="numeric"
        id={id}
        required={required}
        value={display}
        onChange={(e) => setDisplay(formatDobWhileTyping(e.target.value))}
        className={className}
        placeholder="MM/DD/YYYY"
        autoComplete="bday"
        maxLength={10}
      />
    </>
  );
}

function formatDobWhileTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDobDisplayToIso(display: string): string {
  const m = display.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const mm = m[1];
  const dd = m[2];
  const yyyy = m[3];
  const month = Number(mm);
  const day = Number(dd);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return "";
  return `${yyyy}-${mm}-${dd}`;
}
