import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { NotCompleted, QapiReviewPrint } from "@/components/compliance/print-docs";
import { PrintButton } from "@/components/compliance/record-actions";
import { QAPI_COUNT_FIELDS, labelFrom, PROJECT_STATUSES, type QapiAutoKey } from "@/lib/compliance/constants";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { getActiveProject, getQapiReview, qapiLiveCounts, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

const AUTO = new Set<string>([
  "hospitalizations",
  "er_visits",
  "falls",
  "medication_errors",
  "complaints",
  "missed_visits",
  "infections",
]);

export default async function QapiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() =>
    Promise.all([getQapiReview(ctx.year, ctx.quarter), qapiLiveCounts(ctx.year, ctx.quarter), getActiveProject()])
  );
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="QAPI" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const [review, live, project] = loaded.data;
  const period = periodLabel(ctx.year, ctx.quarter);
  const printedAt = formatAppDateTime(new Date());

  const source = review?.status === "finalized" ? "Finalized quarterly review" : review ? "Draft review" : "Incident log — review not saved";

  return (
    <>
    <div className="compliance-screen-only">
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Saintly Home Health"
        title={`QAPI — ${periodLabel(ctx.year, ctx.quarter)}`}
        description={source}
        actions={<PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/qapi" />}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QAPI_COUNT_FIELDS.map(([key, label]) => {
          const stored = review?.[key];
          const value =
            review && stored != null
              ? String(stored)
              : !review && AUTO.has(key)
                ? String(live[key as QapiAutoKey])
                : "—";
          return (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
            </div>
          );
        })}
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current performance improvement project</p>
        <p className="mt-1 text-xl font-bold text-slate-900">{project?.project_name ?? "No active project"}</p>
        {project ? <p className="text-sm font-semibold text-slate-600">{labelFrom(PROJECT_STATUSES, project.status)}</p> : null}
      </section>
      <div className="flex flex-wrap gap-3">
        <Link
          href={complianceHref("/admin/compliance/qapi/review", ctx.year, ctx.quarter)}
          className="inline-flex rounded-2xl bg-sky-600 px-5 py-3 text-base font-semibold text-white"
        >
          Complete Quarterly QAPI Review
        </Link>
        <Link
          href={project ? `/admin/compliance/qapi/project/${project.id}` : "/admin/compliance/qapi/project"}
          className="inline-flex rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-800"
        >
          Manage Performance Improvement Project
        </Link>
        <PrintButton label="Print QAPI Report" />
      </div>
      <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
        Back to Compliance Logs
      </Link>
    </AdminPageShell>
    </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        {review?.status === "finalized" ? (
          <QapiReviewPrint row={review} printedAt={printedAt} />
        ) : (
          <NotCompleted
            title="Quarterly QAPI Review"
            period={period}
            printedAt={printedAt}
            note={review ? "A draft exists but has not been finalized." : undefined}
          />
        )}
      </div>
    </>
  );
}
