"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FacilityOutreachView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityOutreachView").then((m) => m.FacilityOutreachView),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[20rem] animate-pulse rounded-[28px] border border-slate-200 bg-slate-50/80"
        aria-hidden
      />
    ),
  }
);

type FacilityOutreachViewClientProps = ComponentProps<typeof FacilityOutreachView>;

export function FacilityOutreachViewClient(props: FacilityOutreachViewClientProps) {
  return <FacilityOutreachView {...props} />;
}
