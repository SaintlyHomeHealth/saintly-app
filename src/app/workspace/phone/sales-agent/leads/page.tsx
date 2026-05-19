import { SalesAgentDashboard } from "@/components/sales-agent/SalesAgentDashboard";
import { requireSalesAgentOrdersAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function WorkspaceSalesAgentLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const staff = await requireSalesAgentOrdersAccess();
  const sp = await searchParams;

  return (
    <>
      {sp.removed === "1" ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Order removed from your list. Saintly admin still has the lead on file.
        </div>
      ) : null}
      <SalesAgentDashboard staff={staff} />
    </>
  );
}
