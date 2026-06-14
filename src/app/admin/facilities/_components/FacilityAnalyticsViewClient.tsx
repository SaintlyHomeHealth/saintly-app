"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FacilityAnalyticsView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityAnalyticsView").then((m) => m.FacilityAnalyticsView),
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

type FacilityAnalyticsViewClientProps = ComponentProps<typeof FacilityAnalyticsView>;

export function FacilityAnalyticsViewClient(props: FacilityAnalyticsViewClientProps) {
  return <FacilityAnalyticsView {...props} />;
}
