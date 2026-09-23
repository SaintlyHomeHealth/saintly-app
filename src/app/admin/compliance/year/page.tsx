import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { RollupBadge } from "@/components/compliance/ui";
import { quarterSnapshot } from "@/lib/compliance/dashboard";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref } from "@/lib/compliance/period";
import { loadYearSummary, readCompliance } from "@/lib/compliance/queries";

export const dynamic = "force-dynamic";

export default async function ComplianceYearPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() => loadYearSummary(ctx.year));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title={`${ctx.year} Compliance`} description={loaded.message} />
      </AdminPageShell>
    );
  }
  const summary = loaded.data;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Saintly Home Health"
        title={`${ctx.year} Compliance`}
        description="Open a quarter to finish the binder."
        actions={<PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/year" />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {([1, 2, 3, 4] as const).map((quarter) => {
          const snap = quarterSnapshot(summary, ctx.year, quarter, ctx.today);
          return (
            <Link
              key={quarter}
              href={complianceHref("/admin/compliance", ctx.year, quarter)}
              className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm hover:border-sky-300"
            >
              <span className="text-3xl font-bold text-slate-900">Q{quarter}</span>
              <RollupBadge status={snap.rollup} />
            </Link>
          );
        })}
      </div>
    </AdminPageShell>
  );
}
