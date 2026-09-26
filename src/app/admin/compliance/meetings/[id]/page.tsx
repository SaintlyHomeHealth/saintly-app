import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { MeetingForm } from "@/components/compliance/meeting-form";
import { MeetingPrint, NotCompleted } from "@/components/compliance/print-docs";
import { UnlockForm } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { getMeeting, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function MeetingEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const { id } = await params;
  const ctx = await complianceContext(await searchParams);
  const isNew = id === "new";
  const loaded = await readCompliance(() => (isNew ? Promise.resolve(null) : getMeeting(id)));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Meeting Minutes" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const meeting = loaded.data;
  if (!isNew && !meeting) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Meeting Minutes" description="This meeting was not found." />
      </AdminPageShell>
    );
  }
  const year = meeting?.year ?? ctx.year;
  const quarter = meeting?.quarter ?? ctx.quarter;
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="Meeting Minutes"
            description={periodLabel(year, quarter)}
            actions={
              <Link href={complianceHref("/admin/compliance/meetings", year, quarter)} className="text-sm font-semibold text-sky-700">
                All meetings
              </Link>
            }
          />
          {meeting?.status === "finalized" && ctx.canUnlock ? <UnlockForm entity="meeting" id={meeting.id} /> : null}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <MeetingForm meeting={meeting} year={year} quarter={quarter} signerName={ctx.signerName} />
          </div>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        {meeting ? (
          <MeetingPrint meeting={meeting} printedAt={printedAt} />
        ) : (
          <NotCompleted title="Meeting Minutes" period={periodLabel(year, quarter)} printedAt={printedAt} note="This meeting has not been saved." />
        )}
      </div>
    </>
  );
}
