import { redirect } from "next/navigation";

import { canUseWorkspacePhoneAppShell, getStaffProfile } from "@/lib/staff-profile";

/** Legacy route: directory is the Patients hub now. */
export default async function WorkspaceContactsPage() {
  const staff = await getStaffProfile();
  if (!canUseWorkspacePhoneAppShell(staff)) {
    redirect("/admin/phone");
  }
  redirect("/workspace/phone/patients");
}
