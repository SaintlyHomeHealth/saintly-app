"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FacilityFinderView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityFinderView").then((m) => m.FacilityFinderView),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[16rem] animate-pulse rounded-[28px] border border-slate-200 bg-slate-50/80"
        aria-hidden
      />
    ),
  }
);

type FacilityFinderViewClientProps = ComponentProps<typeof FacilityFinderView>;

export function FacilityFinderViewClient(props: FacilityFinderViewClientProps) {
  return <FacilityFinderView {...props} />;
}
