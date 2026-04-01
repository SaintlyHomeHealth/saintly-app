"use client";

import { useFormStatus } from "react-dom";

export function CredentialReminderSubmitButton({
  className,
  disabled,
  title,
  children,
}: {
  className: string;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={className} title={title}>
      {pending ? "Sending…" : children}
    </button>
  );
}
