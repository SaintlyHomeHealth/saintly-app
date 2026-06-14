"use client";

import type { ComponentProps } from "react";

import { FacilityOutreachView } from "@/app/admin/facilities/_components/FacilityOutreachView";

type FacilityOutreachViewClientProps = ComponentProps<typeof FacilityOutreachView>;

export function FacilityOutreachViewClient(props: FacilityOutreachViewClientProps) {
  return <FacilityOutreachView {...props} />;
}
