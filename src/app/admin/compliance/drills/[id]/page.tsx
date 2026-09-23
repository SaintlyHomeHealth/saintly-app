import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { DrillForm } from "@/components/compliance/drill-form";
import { DrillPrint, NotCompleted } from "@/components/compliance/print-docs";
import { UnlockForm } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { getDrill, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function DrillEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const { id } = await params;
  const ctx = await complianceContext(await searchParams);
  const isNew = id === "new";
  const loaded = await readCompliance(() => (isNew ? Promise.resolve(null) : getDrill(id)));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Emergency Drill / Exercise" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const drill = loaded.data;
  if (!isNew && !drill) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Emergency Drill / Exercise" description="This exercise was not found." />
      </AdminPageShell>
    );
  }
  const year = drill?.year ?? ctx.year;
  const quarter = drill?.quarter ?? ctx.quarter;
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="Emergency Drill / Exercise"
            description={periodLabel(year, quarter)}
            actions={
              <Link href={complianceHref("/admin/compliance/drills", year, quarter)} className="text-sm font-semibold text-sky-700">
                All exercises
              </Link>
            }
          />
          {drill?.status === "finalized" && ctx.canUnlock ? <UnlockForm entity="drill" id={drill.id} /> : null}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <DrillForm drill={drill} year={year} quarter={quarter} signerName={ctx.signerName} />
          </div>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        {drill ? (
          <DrillPrint row={drill} printedAt={printedAt} />
        ) : (
          <NotCompleted title="Emergency Drill / Exercise Report" period={periodLabel(year, quarter)} printedAt={printedAt} />
        )}
      </div>
    </>
  );
}
