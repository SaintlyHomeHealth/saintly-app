import { Suspense } from "react";

import { SalesAgentCreateLeadForm } from "@/components/sales-agent/SalesAgentCreateLeadForm";
import { requireSalesAgentOrdersAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function WorkspaceSalesAgentNewLeadPage() {
  await requireSalesAgentOrdersAccess();
  return (
    <Suspense fallback={<p className="text-sm text-slate-600">Loading form…</p>}>
      <SalesAgentCreateLeadForm />
    </Suspense>
  );
}
