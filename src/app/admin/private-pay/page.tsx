import { redirect } from "next/navigation";

import { AdminPageShell } from "@/components/admin/design-system";
import { PrivatePayAdminWorkspace } from "@/components/crm/private-pay/PrivatePayAdminWorkspace";
import { listActiveServiceTemplates, listAllPrivatePayInvoices } from "@/lib/private-pay/data";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export default async function AdminPrivatePayPage() {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    redirect("/admin");
  }

  const [invoices, templates] = await Promise.all([
    listAllPrivatePayInvoices(),
    listActiveServiceTemplates(),
  ]);

  return (
    <AdminPageShell>
      <PrivatePayAdminWorkspace templates={templates} initialInvoices={invoices} />
    </AdminPageShell>
  );
}
