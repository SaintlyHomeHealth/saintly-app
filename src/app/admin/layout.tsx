import type { ReactNode } from "react";

import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { buildAdminNavItems } from "@/lib/admin/admin-nav-config";
import { getStaffProfile } from "@/lib/staff-profile";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  const navItems = buildAdminNavItems(staff);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50/80 via-sky-50/25 to-cyan-50/20">
      <AdminTopNav items={navItems} />
      {children}
    </div>
  );
}
