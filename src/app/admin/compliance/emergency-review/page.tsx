import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { EmergencyReviewForm } from "@/components/compliance/emergency-review-form";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { EmergencyReviewPrint, NotCompleted } from "@/components/compliance/print-docs";
import { NotApplicableForm, UnlockForm } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { getEmergencyReview, listNaMarks, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function EmergencyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() =>
    Promise.all([getEmergencyReview(ctx.year, ctx.quarter), listNaMarks(ctx.year, ctx.quarter)])
  );
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Emergency Plan Review" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const [row, marks] = loaded.data;
  const na = marks.find((mark) => mark.item_key === "emergency_review");
  const printedAt = formatAppDateTime(new Date());
  const period = periodLabel(ctx.year, ctx.quarter);

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="Emergency Plan Review"
            description={period}
            actions={
              <PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/emergency-review" />
            }
          />
          {row?.status === "finalized" && ctx.canUnlock ? <UnlockForm entity="emergency_review" id={row.id} /> : null}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <EmergencyReviewForm row={row} year={ctx.year} quarter={ctx.quarter} signerName={ctx.signerName} today={ctx.today} />
          </div>
          <NotApplicableForm
            year={ctx.year}
            quarter={ctx.quarter}
            itemKey="emergency_review"
            already={Boolean(na)}
            reason={na?.reason}
          />
          <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
            Back to Compliance Logs
          </Link>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        {row ? (
          <EmergencyReviewPrint row={row} printedAt={printedAt} />
        ) : (
          <NotCompleted title="Emergency Plan Review" period={period} printedAt={printedAt} />
        )}
      </div>
    </>
  );
}
