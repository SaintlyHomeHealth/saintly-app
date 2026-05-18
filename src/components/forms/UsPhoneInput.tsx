"use client";

import { formatUsPhoneInput } from "@/lib/phone/us-phone-format";

type UsPhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  autoComplete?: string;
};

/**
 * US phone field with live (XXX) XXX-XXXX formatting for display; parent stores the formatted string.
 */
export function UsPhoneInput({
  value,
  onChange,
  id,
  className,
  inputClassName = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm",
  placeholder = "(916) 796-3306",
  helperText,
  disabled,
  autoComplete = "tel",
}: UsPhoneInputProps) {
  function applyFormatted(raw: string) {
    onChange(formatUsPhoneInput(raw));
  }

  return (
    <span className={className}>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(e) => applyFormatted(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          applyFormatted(e.clipboardData.getData("text"));
        }}
      />
      {helperText ? (
        <span className="mt-1.5 block text-xs font-normal leading-relaxed text-slate-500">
          {helperText}
        </span>
      ) : null}
    </span>
  );
}
