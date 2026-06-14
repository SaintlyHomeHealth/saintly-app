"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FacilityDiscoverView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityDiscoverView").then((m) => m.FacilityDiscoverView),
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

type FacilityDiscoverViewClientProps = ComponentProps<typeof FacilityDiscoverView>;

export function FacilityDiscoverViewClient(props: FacilityDiscoverViewClientProps) {
  return <FacilityDiscoverView {...props} />;
}
