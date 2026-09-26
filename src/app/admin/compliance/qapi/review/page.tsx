import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { NotCompleted, QapiReviewPrint } from "@/components/compliance/print-docs";
import { QapiReviewForm } from "@/components/compliance/qapi-review-form";
import { NotApplicableForm, UnlockForm } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { getQapiReview, listNaMarks, qapiLiveCounts, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function QapiReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() =>
    Promise.all([getQapiReview(ctx.year, ctx.quarter), qapiLiveCounts(ctx.year, ctx.quarter), listNaMarks(ctx.year, ctx.quarter)])
  );
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Quarterly QAPI Review" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const [row, live, marks] = loaded.data;
  const na = marks.find((mark) => mark.item_key === "qapi_review");
  const period = periodLabel(ctx.year, ctx.quarter);
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="Quarterly QAPI Review"
            description={period}
            actions={<PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/qapi/review" />}
          />
          {row?.status === "finalized" && ctx.canUnlock ? <UnlockForm entity="qapi_review" id={row.id} /> : null}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <QapiReviewForm row={row} year={ctx.year} quarter={ctx.quarter} signerName={ctx.signerName} today={ctx.today} live={live} />
          </div>
          <NotApplicableForm year={ctx.year} quarter={ctx.quarter} itemKey="qapi_review" already={Boolean(na)} reason={na?.reason} />
          <Link href={complianceHref("/admin/compliance/qapi", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
            Back to QAPI
          </Link>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        {row ? (
          <QapiReviewPrint row={row} printedAt={printedAt} />
        ) : (
          <NotCompleted title="Quarterly QAPI Review" period={period} printedAt={printedAt} />
        )}
      </div>
    </>
  );
}
