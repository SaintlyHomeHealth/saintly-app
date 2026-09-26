import Link from "next/link";

import { PrintButton } from "@/components/compliance/record-actions";
import {
  DocHeader,
  DrillPrint,
  EmergencyReviewPrint,
  IncidentPrint,
  MeetingPrint,
  NotCompleted,
  OnCallPrint,
  ProjectPrint,
  QapiReviewPrint,
  SafetyPrint,
} from "@/components/compliance/print-docs";
import { COMPANY_NAME, COMPANY_TAGLINE, labelFrom, PROJECT_STATUSES } from "@/lib/compliance/constants";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, periodLabel, quarterBounds, quarterRangeIso } from "@/lib/compliance/period";
import {
  getActiveProject,
  getAttestation,
  getEmergencyReview,
  getProject,
  getQapiReview,
  getSafety,
  listDrills,
  listIncidents,
  listMeetings,
  listNaMarks,
  listOnCall,
  readCompliance,
} from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

function line(label: string, state: string) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2 text-sm">
      <span>{label}</span>
      <span className="font-bold uppercase">{state}</span>
    </li>
  );
}

function stateLabel(finalized: boolean, notApplicable: boolean): string {
  if (finalized) return "Complete";
  if (notApplicable) return "Not applicable";
  return "Not completed";
}

export default async function PacketPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string }>;
}) {
  const ctx = await complianceContext(await searchParams);
  const bounds = quarterBounds(ctx.year, ctx.quarter);
  const range = quarterRangeIso(ctx.year, ctx.quarter);
  const period = periodLabel(ctx.year, ctx.quarter);
  const printedAt = formatAppDateTime(new Date());

  const loaded = await readCompliance(() =>
    Promise.all([
      listMeetings(ctx.year, ctx.quarter),
      getSafety(ctx.year, ctx.quarter),
      getEmergencyReview(ctx.year, ctx.quarter),
      listDrills(ctx.year, ctx.quarter),
      listOnCall(range.start, range.end),
      getAttestation("quarter", ctx.year, ctx.quarter),
      listIncidents(bounds.start, bounds.end),
      getQapiReview(ctx.year, ctx.quarter),
      listNaMarks(ctx.year, ctx.quarter),
      getActiveProject(),
    ])
  );
  if (!loaded.ok) return <div className="p-6 text-sm">{loaded.message}</div>;
  const [meetings, safety, review, drills, calls, attestation, incidents, qapi, marks, active] = loaded.data;
  const projectLoaded = await readCompliance(() => (active ? getProject(active.id) : Promise.resolve(null)));
  if (!projectLoaded.ok) return <div className="p-6 text-sm">{projectLoaded.message}</div>;
  const projectDetail = projectLoaded.data;
  const na = new Set(marks.map((mark) => mark.item_key));
  const naReason = (key: string) => marks.find((mark) => mark.item_key === key)?.reason ?? undefined;
  const finalizedMeetings = meetings.filter((meeting) => meeting.status === "finalized");
  const finalizedDrills = drills.filter((drill) => drill.status === "finalized");
  const safetyDone = safety?.status === "finalized";
  const reviewDone = review?.status === "finalized";
  const qapiDone = qapi?.status === "finalized";
  const onCallReady = calls.length > 0 || Boolean(attestation);

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-slate-900">
      <div className="compliance-screen-only mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
          Back to Compliance Logs
        </Link>
        <PrintButton label="Print Quarterly Compliance Packet" />
      </div>

      <article className="packet-section">
        <p className="text-sm font-bold tracking-wide">{COMPANY_NAME}</p>
        <p className="text-sm italic text-slate-600">{COMPANY_TAGLINE}</p>
        <h1 className="mt-6 text-3xl font-bold">Quarterly Compliance Packet</h1>
        <p className="mt-2 text-2xl font-semibold">{period}</p>
        <p className="mt-6 text-sm">Prepared by: {ctx.signerName}</p>
        <p className="text-sm">Date printed: {printedAt}</p>
        <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">Contents</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {line("Quarterly checklist", "This packet")}
          {line("Meeting minutes", stateLabel(finalizedMeetings.length > 0, na.has("meetings")))}
          {line("Fire / safety check", stateLabel(safetyDone, na.has("safety")))}
          {line("Emergency plan review", stateLabel(reviewDone, na.has("emergency_review")))}
          {line("Emergency drill / exercise", stateLabel(finalizedDrills.length > 0, na.has("drill")))}
          {line("On-call log", onCallReady ? (calls.length ? `${calls.length} calls` : "No calls signed") : "Not completed")}
          {line("Incident / complaint log", `${incidents.length} entries`)}
          {line("Quarterly QAPI review", stateLabel(Boolean(qapiDone), na.has("qapi_review")))}
          {line("QAPI performance improvement project", projectDetail ? labelFrom(PROJECT_STATUSES, projectDetail.project.status) : "Not completed")}
        </ol>
      </article>

      <article className="packet-section">
        <DocHeader title="Quarterly Checklist" period={period} printedAt={printedAt} />
        <ul className="mt-6 list-none space-y-2 p-0 text-sm">
          {line("Meeting minutes", stateLabel(finalizedMeetings.length > 0, na.has("meetings")))}
          {line("Fire / safety check", stateLabel(safetyDone, na.has("safety")))}
          {line("Emergency plan review", stateLabel(reviewDone, na.has("emergency_review")))}
          {line("Emergency drill / exercise", stateLabel(finalizedDrills.length > 0, na.has("drill")))}
          {line("On-call log", onCallReady ? (calls.length ? `${calls.length} calls` : "No calls signed") : "Not completed")}
          {line("Incident / complaint log", `${incidents.length} entries`)}
          {line("Quarterly QAPI review", stateLabel(Boolean(qapiDone), na.has("qapi_review")))}
          {line("QAPI performance improvement project", projectDetail ? labelFrom(PROJECT_STATUSES, projectDetail.project.status) : "Not completed")}
        </ul>
      </article>

      {finalizedMeetings.length > 0 ? (
        finalizedMeetings.map((meeting) => <MeetingPrint key={meeting.id} meeting={meeting} printedAt={printedAt} />)
      ) : (
        <NotCompleted
          title="Meeting Minutes"
          period={period}
          printedAt={printedAt}
          heading={na.has("meetings") ? "NOT APPLICABLE" : "NOT COMPLETED"}
          note={na.has("meetings") ? naReason("meetings") : meetings.length ? "A draft exists but has not been finalized." : undefined}
        />
      )}

      {safetyDone && safety ? (
        <SafetyPrint row={safety} printedAt={printedAt} />
      ) : (
        <NotCompleted
          title="Office Fire & Safety Check"
          period={period}
          printedAt={printedAt}
          heading={na.has("safety") ? "NOT APPLICABLE" : "NOT COMPLETED"}
          note={na.has("safety") ? naReason("safety") : safety ? "A draft exists but has not been finalized." : undefined}
        />
      )}

      {reviewDone && review ? (
        <EmergencyReviewPrint row={review} printedAt={printedAt} />
      ) : (
        <NotCompleted
          title="Emergency Plan Review"
          period={period}
          printedAt={printedAt}
          heading={na.has("emergency_review") ? "NOT APPLICABLE" : "NOT COMPLETED"}
          note={na.has("emergency_review") ? naReason("emergency_review") : review ? "A draft exists but has not been finalized." : undefined}
        />
      )}

      {finalizedDrills.length > 0 ? (
        finalizedDrills.map((drill) => <DrillPrint key={drill.id} row={drill} printedAt={printedAt} />)
      ) : (
        <NotCompleted
          title="Emergency Drill / Exercise Report"
          period={period}
          printedAt={printedAt}
          heading={na.has("drill") ? "NOT APPLICABLE" : "NOT COMPLETED"}
          note={na.has("drill") ? naReason("drill") : drills.length ? "A draft exists but has not been finalized." : undefined}
        />
      )}

      <OnCallPrint rows={calls} period={period} printedAt={printedAt} attestation={attestation} />
      <IncidentPrint rows={incidents} period={period} printedAt={printedAt} />

      {qapiDone && qapi ? (
        <QapiReviewPrint row={qapi} printedAt={printedAt} />
      ) : (
        <NotCompleted
          title="Quarterly QAPI Review"
          period={period}
          printedAt={printedAt}
          heading={na.has("qapi_review") ? "NOT APPLICABLE" : "NOT COMPLETED"}
          note={na.has("qapi_review") ? naReason("qapi_review") : qapi ? "A draft exists but has not been finalized." : undefined}
        />
      )}

      {projectDetail ? (
        <ProjectPrint project={projectDetail.project} updates={projectDetail.updates} printedAt={printedAt} />
      ) : (
        <NotCompleted title="QAPI Performance Improvement Project" period={period} printedAt={printedAt} />
      )}
    </div>
  );
}
