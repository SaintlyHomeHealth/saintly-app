import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PrivatePayAdminWorkspace } from "@/components/crm/private-pay/PrivatePayAdminWorkspace";
import { listActiveServiceTemplates, listAllPrivatePayInvoices } from "@/lib/private-pay/data";
import { getPrivatePaySettingsRow } from "@/lib/private-pay/settings-data";
import { privatePaySettingsInputFromRow } from "@/lib/private-pay/payment-settings";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

export default async function AdminPrivatePayPage() {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    redirect("/admin");
  }

  const [invoices, templates, settingsRow] = await Promise.all([
    listAllPrivatePayInvoices(),
    listActiveServiceTemplates(),
    getPrivatePaySettingsRow(),
  ]);
  const paymentSettings = privatePaySettingsInputFromRow(settingsRow);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Billing"
        title="Private Pay"
        description={
          <>
            Bill private-pay patients directly for respite care, personal care, skilled nursing, physical therapy, and
            custom services. Separate from Medicare/insurance and Alora. Zelle and other manual methods are preferred;
            card payments are optional via Stripe. Use <strong>Payment settings</strong> to update pay instructions
            without redeploying.
          </>
        }
      />

      <PrivatePayAdminWorkspace
        templates={templates}
        initialInvoices={invoices}
        initialPaymentSettings={paymentSettings}
      />
    </div>
  );
}
