import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { WorkspaceGlobalSoftphoneShell } from "./WorkspaceGlobalSoftphoneShell";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  return <WorkspaceGlobalSoftphoneShell>{children}</WorkspaceGlobalSoftphoneShell>;
}
