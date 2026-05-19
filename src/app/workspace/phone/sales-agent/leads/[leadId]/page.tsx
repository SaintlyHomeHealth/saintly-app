import { SalesAgentLeadDetail } from "@/components/sales-agent/SalesAgentLeadDetail";
import { requireSalesAgentOrdersAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function WorkspaceSalesAgentLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ created?: string; uploaded?: string }>;
}) {
  const staff = await requireSalesAgentOrdersAccess();
  const { leadId } = await params;
  const sp = await searchParams;

  return (
    <SalesAgentLeadDetail
      staff={staff}
      leadId={leadId}
      created={sp.created === "1"}
      uploaded={sp.uploaded === "1"}
    />
  );
}
