import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { WorkspaceGlobalSoftphoneShell } from "./WorkspaceGlobalSoftphoneShell";
import { adminPerfTimed, routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { canAccessWorkspaceShell, getStaffProfile } from "@/lib/staff-profile";

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

    return <WorkspaceGlobalSoftphoneShell>{children}</WorkspaceGlobalSoftphoneShell>;
  } finally {
    routePerfLog("workspace/layout", perfStart);
  }
}
