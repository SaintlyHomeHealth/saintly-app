"use client";

import type { ComponentProps } from "react";

import { FacilityFinderView } from "@/app/admin/facilities/_components/FacilityFinderView";

type FacilityFinderViewClientProps = ComponentProps<typeof FacilityFinderView>;

export function FacilityFinderViewClient(props: FacilityFinderViewClientProps) {
  return <FacilityFinderView {...props} />;
}
