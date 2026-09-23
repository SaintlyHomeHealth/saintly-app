import type { ReactNode } from "react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { StatusBadge } from "@/components/compliance/ui";
import { quarterSnapshot } from "@/lib/compliance/dashboard";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel } from "@/lib/compliance/period";
import { loadYearSummary, readCompliance } from "@/lib/compliance/queries";
import { labelFrom, PROJECT_STATUSES } from "@/lib/compliance/constants";

export const dynamic = "force-dynamic";

function Row({ href, title, detail, badge }: { href: string; title: string; detail?: string; badge: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40"
    >
      <span>
        <span className="block text-lg font-semibold text-slate-900">{title}</span>
        {detail ? <span className="text-sm text-slate-500">{detail}</span> : null}
      </span>
      {badge}
    </Link>
  );
}

export default async function ComplianceHomePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const loaded = await readCompliance(() => loadYearSummary(ctx.year));
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="Compliance Logs" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const summary = loaded.data;

  const snap = quarterSnapshot(summary, ctx.year, ctx.quarter, ctx.today);
  const href = (path: string) => complianceHref(path, ctx.year, ctx.quarter);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Saintly Home Health"
        title="Compliance Logs"
        description={periodLabel(ctx.year, ctx.quarter)}
        actions={
          <div className="flex flex-wrap items-end justify-between gap-4">
            <PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance" />
            <Link href={complianceHref("/admin/compliance/year", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
              {ctx.year} compliance
            </Link>
          </div>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Quarterly checklist</h2>
        <Row
          href={href("/admin/compliance/meetings")}
          title="Meeting Minutes"
          detail={snap.meetingCount ? `${snap.finalizedMeetings} finalized · ${snap.meetingCount} saved` : undefined}
          badge={<StatusBadge status={snap.meetings} />}
        />
        <Row href={href("/admin/compliance/safety")} title="Fire / Safety Check" badge={<StatusBadge status={snap.safety} />} />
        <Row
          href={href("/admin/compliance/emergency-review")}
          title="Emergency Plan Review"
          badge={<StatusBadge status={snap.emergencyReview} />}
        />
        <Row
          href={href("/admin/compliance/drills")}
          title="Emergency Drill / Exercise"
          detail={snap.finalizedDrills ? `${snap.finalizedDrills} finalized` : undefined}
          badge={<StatusBadge status={snap.drill} />}
        />
        <Row
          href={href("/admin/compliance/qapi")}
          title="Quarterly QAPI Review"
          badge={<StatusBadge status={snap.qapi} />}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Ongoing logs</h2>
        <Row
          href={href("/admin/compliance/on-call")}
          title="On-Call Log"
          badge={
            <span className="text-base font-bold text-slate-800">
              {snap.onCallCount} {snap.onCallCount === 1 ? "call" : "calls"}
            </span>
          }
        />
        <Row
          href={href("/admin/compliance/incidents")}
          title="Incident / Complaint Log"
          badge={
            <span className="text-base font-bold text-slate-800">
              {snap.incidentCount} {snap.incidentCount === 1 ? "entry" : "entries"}
            </span>
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">QAPI project</h2>
        <Row
          href={snap.project ? `/admin/compliance/qapi/project/${snap.project.id}` : "/admin/compliance/qapi/project"}
          title={snap.project?.name || "Current Performance Improvement Project"}
          detail={snap.project ? undefined : "No active project"}
          badge={
            <span className="text-base font-bold text-slate-800">
              {snap.project ? labelFrom(PROJECT_STATUSES, snap.project.status) : "—"}
            </span>
          }
        />
      </section>

      <Link
        href={href("/admin/compliance/packet")}
        className="flex w-full items-center justify-center rounded-2xl bg-sky-600 px-6 py-4 text-lg font-bold text-white shadow-sm hover:bg-sky-700"
      >
        Print Quarterly Compliance Packet
      </Link>
    </AdminPageShell>
  );
}
