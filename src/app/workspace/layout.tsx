import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { adminPerfTimed, routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { canAccessWorkspaceShell, getStaffProfile } from "@/lib/staff-profile";

/** Twilio/inbound polling live only under `/workspace/phone/*` — see {@link WorkspaceGlobalSoftphoneShell} in phone/layout. */

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const perfStart = routePerfStart();
  try {
    const staff = await adminPerfTimed("workspace/layout.getStaffProfile", getStaffProfile);
    if (!staff) {
      redirect("/login");
    }
    if (!canAccessWorkspaceShell(staff)) {
      redirect("/unauthorized?reason=forbidden");
    }

    return <>{children}</>;
  } finally {
    routePerfLog("workspace/layout", perfStart);
  }
}
