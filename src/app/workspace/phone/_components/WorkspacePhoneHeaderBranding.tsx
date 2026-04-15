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
        className={`text-[10px] font-bold uppercase tracking-[0.2em] text-phone-ink/70 ${
          compact ? "lg:text-[9px] lg:tracking-[0.14em]" : ""
        }`}
      >
        Saintly Phone
      </p>
      <p
        className={`truncate text-sm font-semibold text-phone-navy ${compact ? "lg:text-xs" : ""}`}
      >
        {displayName}
      </p>
    </div>
  );
}
