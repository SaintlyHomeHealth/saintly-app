import PerformanceEvaluationForm from "@/components/admin/forms/performance-evaluation-form";

export default async function PerformanceEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ eventId?: string; startNewVersion?: string }>;
}) {
  const { employeeId } = await params;
  const { eventId, startNewVersion } = await searchParams;
  const startNewVersionEnabled = startNewVersion === "1" || startNewVersion === "true";

  if (!employeeId) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  return (
    <div className="p-6">
      <PerformanceEvaluationForm
        employeeId={employeeId}
        complianceEventId={eventId || null}
        startNewVersion={startNewVersionEnabled}
      />
    </div>
  );
}
