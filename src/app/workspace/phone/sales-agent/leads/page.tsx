import { SalesAgentDashboard } from "@/components/sales-agent/SalesAgentDashboard";
import { requireSalesAgentOrdersAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function WorkspaceSalesAgentLeadsPage() {
  const staff = await requireSalesAgentOrdersAccess();
  return <SalesAgentDashboard staff={staff} />;
}
