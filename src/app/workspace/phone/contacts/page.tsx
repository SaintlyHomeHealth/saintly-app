import { redirect } from "next/navigation";

import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/** Legacy route: directory is the Patients hub now. */
export default async function WorkspaceContactsPage() {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  redirect("/workspace/phone/patients");
}
