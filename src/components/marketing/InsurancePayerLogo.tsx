"use client";

import Image from "next/image";
import { useState } from "react";
import { INSURANCE_LOGO_BASE_PATH } from "@/lib/marketing/insurance-accepted-payers";
import { NAVY } from "./marketing-design";

type InsurancePayerLogoProps = {
  logoFile: string;
  logoAlt: string;
  logoInitials: string;
  payerName: string;
};

/** Local payer logo with branded initials fallback when the file is missing. */
export function InsurancePayerLogo({
  logoFile,
  logoAlt,
  logoInitials,
  payerName,
}: InsurancePayerLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = `${INSURANCE_LOGO_BASE_PATH}/${logoFile}`;

  if (failed) {
    return (
      <div
        className="flex h-[4.5rem] w-full max-w-[12rem] items-center justify-center rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
        role="img"
        aria-label={`${payerName} logo placeholder`}
      >
        <span
          className="text-[1.05rem] font-bold tracking-[0.12em]"
          style={{ color: NAVY }}
          aria-hidden
        >
          {logoInitials}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex h-[4.5rem] w-full max-w-[12rem] items-center justify-center">
      <Image
        src={src}
        alt={logoAlt}
        width={192}
        height={72}
        className="max-h-[4.5rem] w-auto max-w-full object-contain object-center"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
