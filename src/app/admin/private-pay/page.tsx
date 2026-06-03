import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PrivatePayAdminWorkspace } from "@/components/crm/private-pay/PrivatePayAdminWorkspace";
import { listActiveServiceTemplates, listAllPrivatePayInvoices } from "@/lib/private-pay/data";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export default async function AdminPrivatePayPage() {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    redirect("/admin");
  }

  const [invoices, templates] = await Promise.all([listAllPrivatePayInvoices(), listActiveServiceTemplates()]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Billing"
        title="Private Pay"
        description={
          <>
            Bill private-pay patients directly for respite care, personal care, skilled nursing, physical therapy, and
            custom services. Separate from Medicare/insurance and Alora. Card payments are processed securely by
            Stripe.
          </>
        }
      />

      <PrivatePayAdminWorkspace templates={templates} initialInvoices={invoices} />
    </div>
  );
}
