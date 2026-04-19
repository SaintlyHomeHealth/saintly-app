"use client";

import { usePathname } from "next/navigation";

type Props = { displayName: string };

/** Tighter typography on desktop inbox list route only. */
export function WorkspacePhoneHeaderBranding({ displayName }: Props) {
  const pathname = usePathname() ?? "";
  const compact = pathname === "/workspace/phone/inbox";

  return (
    <div className="min-w-0">
      <p
        className={`text-[9px] font-bold uppercase tracking-[0.16em] text-phone-ink/65 sm:text-[10px] sm:tracking-[0.2em] ${
          compact ? "lg:text-[9px] lg:tracking-[0.14em]" : ""
        }`}
      >
        Saintly Phone
      </p>
      <p
        className={`truncate text-[13px] font-semibold leading-tight text-phone-navy sm:text-sm ${compact ? "lg:text-xs" : ""}`}
      >
        {displayName}
      </p>
    </div>
  );
}
