"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FacilityRouteBuilderView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityRouteBuilderView").then(
      (m) => m.FacilityRouteBuilderView
    ),
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

type FacilityRouteBuilderViewClientProps = ComponentProps<typeof FacilityRouteBuilderView>;

export function FacilityRouteBuilderViewClient(props: FacilityRouteBuilderViewClientProps) {
  return <FacilityRouteBuilderView {...props} />;
}
