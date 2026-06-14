"use client";

import type { ComponentProps } from "react";

import { FacilityRouteBuilderView } from "@/app/admin/facilities/_components/FacilityRouteBuilderView";

type FacilityRouteBuilderViewClientProps = ComponentProps<typeof FacilityRouteBuilderView>;

export function FacilityRouteBuilderViewClient(props: FacilityRouteBuilderViewClientProps) {
  return <FacilityRouteBuilderView {...props} />;
}
