"use client";

import dynamic from "next/dynamic";

import { SectionCardSkeleton } from "./onboarding-deferred-skeletons";

const PersonnelFileAuditDeferred = dynamic(() => import("./personnel-file-audit-deferred"), {
  ssr: false,
  loading: () => <SectionCardSkeleton />,
});

export default PersonnelFileAuditDeferred;
