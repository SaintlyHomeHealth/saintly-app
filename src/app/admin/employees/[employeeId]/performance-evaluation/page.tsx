import { redirect } from "next/navigation";

/**
 * Short admin URL for Performance Evaluation; canonical form UI lives under /forms/performance-evaluation.
 */
export default async function PerformanceEvaluationAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ eventId?: string; startNewVersion?: string }>;
}) {
  const { employeeId } = await params;
  const { eventId, startNewVersion } = await searchParams;

  if (!employeeId) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  const qs = new URLSearchParams();
  if (eventId) qs.set("eventId", eventId);
  if (startNewVersion === "1" || startNewVersion === "true") qs.set("startNewVersion", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  redirect(`/admin/employees/${employeeId}/forms/performance-evaluation${suffix}`);
}
