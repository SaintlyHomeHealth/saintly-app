import { redirect } from "next/navigation";

import { canUseWorkspacePhoneAppShell, getStaffProfile } from "@/lib/staff-profile";

/** Legacy route: follow-ups tab became internal Chat. */
export default async function WorkspaceFollowUpsTodayPage() {
  const staff = await getStaffProfile();
  if (!canUseWorkspacePhoneAppShell(staff)) {
    redirect("/admin/phone");
  }
  redirect("/workspace/phone/chat");
}
