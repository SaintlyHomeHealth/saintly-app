"use client";

import { useCallback, useState } from "react";

import { formatSsnDisplay } from "@/lib/crm/ssn-mask";

type Props = {
  name?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string;
};

export function FormattedSsnInput({
  name = "social_security_number",
  required,
  className,
  defaultValue = "",
}: Props) {
  const initial = formatSsnDisplay(defaultValue.replace(/\D/g, ""));
  const [display, setDisplay] = useState(initial);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplay(formatSsnDisplay(e.target.value));
  }, []);

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
