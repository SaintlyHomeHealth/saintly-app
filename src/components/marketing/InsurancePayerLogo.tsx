"use client";

import Image from "next/image";
import { useState } from "react";
import { insurancePlanAlt } from "@/lib/marketing/insurance-accepted-payers";
import { NAVY } from "./marketing-design";

type InsurancePayerLogoProps = {
  name: string;
  logo: string;
  initials: string;
};

/** Centered, contained plan logo with a branded initials fallback. */
export function InsurancePayerLogo({ name, logo, initials }: InsurancePayerLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        role="img"
        aria-label={insurancePlanAlt(name)}
      >
        <span
          className="inline-flex items-center justify-center rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white px-5 py-3 text-[1.15rem] font-bold tracking-[0.12em] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          style={{ color: NAVY }}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={logo}
      alt={insurancePlanAlt(name)}
      fill
      sizes="(max-width: 640px) 40vw, (max-width: 1024px) 28vw, 18vw"
      quality={92}
      className="object-contain object-center p-1"
      onError={() => setFailed(true)}
    />
  );
}
