"use client";

import type { ComponentProps } from "react";

import { FacilityAnalyticsView } from "@/app/admin/facilities/_components/FacilityAnalyticsView";

type FacilityAnalyticsViewClientProps = ComponentProps<typeof FacilityAnalyticsView>;

export function FacilityAnalyticsViewClient(props: FacilityAnalyticsViewClientProps) {
  return <FacilityAnalyticsView {...props} />;
}
