import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { IncidentBoard } from "@/components/compliance/incident-board";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { IncidentPrint } from "@/components/compliance/print-docs";
import { PrintButton } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel, quarterBounds } from "@/lib/compliance/period";
import { listIncidents, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const bounds = quarterBounds(ctx.year, ctx.quarter);
  const loaded = await readCompliance(() => listIncidents(bounds.start, bounds.end));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Incident / Complaint Log" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const rows = loaded.data;
  const period = periodLabel(ctx.year, ctx.quarter);
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="Incident / Complaint Log"
            description={period}
            actions={<PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/incidents" />}
          />
          <PrintButton label="Print Quarter" />
          <IncidentBoard rows={rows} today={ctx.today} signerName={ctx.signerName} />
          <p className="text-sm text-slate-500">
            Hospitalizations, ER visits, falls, medication errors, complaints, missed visits, and infections on this log
            are counted on the quarterly QAPI review. You can still type different QAPI numbers.
          </p>
          <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
            Back to Compliance Logs
          </Link>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        <IncidentPrint rows={rows} period={period} printedAt={printedAt} />
      </div>
    </>
  );
}
