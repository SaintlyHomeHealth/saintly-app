"use client";

import type { ComponentProps } from "react";

import { FacilityDiscoverView } from "@/app/admin/facilities/_components/FacilityDiscoverView";

type FacilityDiscoverViewClientProps = ComponentProps<typeof FacilityDiscoverView>;

export function FacilityDiscoverViewClient(props: FacilityDiscoverViewClientProps) {
  return <FacilityDiscoverView {...props} />;
}
