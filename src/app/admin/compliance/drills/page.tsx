import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { NotApplicableForm } from "@/components/compliance/record-actions";
import { EXERCISE_TYPES, labelFrom } from "@/lib/compliance/constants";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { listDrills, listNaMarks, readCompliance } from "@/lib/compliance/queries";
import { formatAppDate } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function DrillsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() =>
    Promise.all([listDrills(ctx.year, ctx.quarter), listNaMarks(ctx.year, ctx.quarter)])
  );
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Emergency Drill / Exercise" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const [drills, marks] = loaded.data;
  const na = marks.find((mark) => mark.item_key === "drill");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Saintly Home Health"
        title="Emergency Drill / Exercise"
        description={periodLabel(ctx.year, ctx.quarter)}
        actions={
          <div className="flex flex-wrap items-end justify-between gap-3">
            <PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/drills" />
            <Link
              href={complianceHref("/admin/compliance/drills/new", ctx.year, ctx.quarter)}
              className="inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-base font-semibold text-white"
            >
              + New exercise
            </Link>
          </div>
        }
      />
      <div className="space-y-3">
        {drills.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-slate-600">
            No exercises saved for this quarter.
          </p>
        ) : (
          drills.map((drill) => (
            <Link
              key={drill.id}
              href={`/admin/compliance/drills/${drill.id}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4"
            >
              <span>
                <span className="block text-lg font-semibold text-slate-900">
                  {labelFrom(EXERCISE_TYPES, drill.exercise_type)}
                </span>
                <span className="text-sm text-slate-500">
                  {drill.exercise_date ? formatAppDate(`${drill.exercise_date}T12:00:00-07:00`) : "No date yet"}
                </span>
              </span>
              <span className="text-sm font-bold uppercase text-slate-600">{drill.status}</span>
            </Link>
          ))
        )}
      </div>
      <NotApplicableForm year={ctx.year} quarter={ctx.quarter} itemKey="drill" already={Boolean(na)} reason={na?.reason} />
      <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
        Back to Compliance Logs
      </Link>
    </AdminPageShell>
  );
}
