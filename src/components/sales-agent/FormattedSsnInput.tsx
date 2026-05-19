"use client";

import { useCallback, useState } from "react";

import { formatSsnDisplay } from "@/lib/crm/ssn-mask";

type Props = {
  name?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (display: string) => void;
};

export function FormattedSsnInput({
  name = "social_security_number",
  required,
  className,
  defaultValue = "",
  value: controlledDisplay,
  onValueChange,
}: Props) {
  const initial = formatSsnDisplay((controlledDisplay ?? defaultValue).replace(/\D/g, ""));
  const [internalDisplay, setInternalDisplay] = useState(initial);
  const display = controlledDisplay ?? internalDisplay;

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = formatSsnDisplay(e.target.value);
      if (onValueChange) onValueChange(next);
      else setInternalDisplay(next);
    },
    [onValueChange]
  );

  return (
    <>
      <input type="hidden" name={name} value={display.replace(/\D/g, "")} readOnly />
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={display}
        onChange={onChange}
        placeholder="XXX-XX-XXXX"
        maxLength={11}
        className={className}
        aria-label="Social Security Number"
      />
    </>
  );
}
