import { redirect } from "next/navigation";

import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/** Legacy route: follow-ups tab became internal Chat. */
export default async function WorkspaceFollowUpsTodayPage() {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  redirect("/workspace/phone/chat");
}
