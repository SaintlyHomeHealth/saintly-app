import { COMPANY_NAME, COMPANY_TAGLINE, labelFrom, MEETING_TYPES, EXERCISE_TYPES, INCIDENT_TYPES, PROJECT_STATUSES, QAPI_COUNT_FIELDS, SAFETY_ITEMS, EMERGENCY_REVIEW_ITEMS, NIL_ON_CALL_STATEMENT } from "@/lib/compliance/constants";
import { monthLabel, periodLabel } from "@/lib/compliance/period";
import type { AttestationRow, DrillRow, EmergencyReviewRow, IncidentRow, MeetingRow, OnCallRow, ProjectRow, ProjectUpdateRow, QapiReviewRow, SafetyRow } from "@/lib/compliance/types";
import { formatAppDate, formatAppDateTime } from "@/lib/datetime/app-timezone";

function showDate(value: string | null | undefined): string {
  if (!value) return "—";
  return formatAppDate(value.includes("T") ? value : `${value}T12:00:00-07:00`, "—");
}

function showTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

export function DocHeader({
  title,
  period,
  completed,
  printedAt,
  draft,
}: {
  title: string;
  period: string;
  completed?: string | null;
  printedAt: string;
  draft?: boolean;
}) {
  return (
    <header className="border-b border-slate-300 pb-3">
      <p className="text-sm font-bold tracking-wide text-slate-900">{COMPANY_NAME}</p>
      <p className="text-sm italic text-slate-600">{COMPANY_TAGLINE}</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-950">{title}</h1>
      <p className="mt-2 text-sm text-slate-800">Reporting period: {period}</p>
      <p className="text-sm text-slate-800">Completed date: {completed ? showDate(completed) : "—"}</p>
      <p className="text-sm text-slate-600">Printed {printedAt}</p>
      {draft ? <p className="mt-3 text-lg font-bold text-rose-700">DRAFT — NOT FINALIZED</p> : null}
    </header>
  );
}

export function NotCompleted({
  title,
  period,
  printedAt,
  note,
  heading = "NOT COMPLETED",
}: {
  title: string;
  period: string;
  printedAt: string;
  note?: string;
  heading?: string;
}) {
  return (
    <article className="packet-section">
      <DocHeader title={title} period={period} printedAt={printedAt} />
      <p className="mt-10 text-3xl font-bold tracking-wide text-slate-950">{heading}</p>
      {note ? <p className="mt-3 max-w-xl text-sm text-slate-700">{note}</p> : null}
    </article>
  );
}

function Block({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function Sig({ label, name, at }: { label: string; name: string | null | undefined; at: string | null | undefined }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {name ? (
        <>
          <p className="mt-1 font-serif text-2xl text-slate-950">{name}</p>
          <p className="text-xs text-slate-600">{at ? `Signed ${formatAppDateTime(at)}` : "Signed"}</p>
        </>
      ) : (
        <p className="mt-6 text-sm text-slate-500">Not signed</p>
      )}
    </div>
  );
}

function YesNoList({
  items,
  checks,
}: {
  items: readonly (readonly [string, string])[];
  checks: Record<string, boolean> | null | undefined;
}) {
  return (
    <ul className="mt-4 space-y-1 text-sm">
      {items.map(([key, label]) => (
        <li key={key} className="flex gap-2">
          <span className="w-10 font-bold">{checks?.[key] ? "Yes" : "No"}</span>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export function MeetingPrint({ meeting, printedAt }: { meeting: MeetingRow; printedAt: string }) {
  return (
    <article className="packet-section">
      <DocHeader
        title="Meeting Minutes"
        period={periodLabel(meeting.year, meeting.quarter)}
        completed={meeting.finalized_at ?? meeting.meeting_date}
        printedAt={printedAt}
        draft={meeting.status !== "finalized"}
      />
      <Block label="Meeting type" value={labelFrom(MEETING_TYPES, meeting.meeting_type)} />
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Block label="Meeting date" value={showDate(meeting.meeting_date)} />
        <Block label="Start" value={showTime(meeting.start_time)} />
        <Block label="End" value={showTime(meeting.end_time)} />
      </div>
      <Block label="Attendees" value={meeting.attendees} />
      <Block label="Topics discussed" value={meeting.topics_discussed} />
      <Block label="Problems / concerns identified" value={meeting.problems_identified} />
      <Block label="Actions decided" value={meeting.actions_decided} />
      <div className="grid grid-cols-2 gap-3">
        <Block label="Person responsible" value={meeting.person_responsible} />
        <Block label="Due date" value={showDate(meeting.due_date)} />
      </div>
      <Block label="Follow-up from prior meeting" value={meeting.follow_up_prior} />
      <Block label="Additional notes" value={meeting.additional_notes} />
      <Sig label="Administrator signature" name={meeting.admin_signed_name} at={meeting.admin_signed_at} />
      <Sig label="Clinical Director / RN signature" name={meeting.clinical_signed_name} at={meeting.clinical_signed_at} />
    </article>
  );
}

export function SafetyPrint({ row, printedAt }: { row: SafetyRow; printedAt: string }) {
  return (
    <article className="packet-section">
      <DocHeader
        title="Office Fire & Safety Check"
        period={periodLabel(row.year, row.quarter)}
        completed={row.finalized_at ?? row.inspection_date}
        printedAt={printedAt}
        draft={row.status !== "finalized"}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Block label="Inspection date" value={showDate(row.inspection_date)} />
        <Block label="Completed by" value={row.completed_by_name} />
      </div>
      <YesNoList items={SAFETY_ITEMS} checks={row.checks} />
      <Block label="Problems found" value={row.problems_found} />
      <Block label="Corrective action" value={row.corrective_action} />
      <div className="grid grid-cols-2 gap-3">
        <Block label="Date corrected" value={showDate(row.date_corrected)} />
        <Block label="Corrected by" value={row.corrected_by} />
      </div>
      <Sig label="Completed by signature" name={row.completed_signed_name} at={row.completed_signed_at} />
      <Sig label="Administrator signature" name={row.admin_signed_name} at={row.admin_signed_at} />
    </article>
  );
}

export function EmergencyReviewPrint({ row, printedAt }: { row: EmergencyReviewRow; printedAt: string }) {
  return (
    <article className="packet-section">
      <DocHeader
        title="Emergency Plan Review"
        period={periodLabel(row.year, row.quarter)}
        completed={row.finalized_at ?? row.review_date}
        printedAt={printedAt}
        draft={row.status !== "finalized"}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Block label="Review date" value={showDate(row.review_date)} />
        <Block label="Reviewed by" value={row.reviewed_by_name} />
      </div>
      <YesNoList items={EMERGENCY_REVIEW_ITEMS} checks={row.checks} />
      <Block label="Changes" value={row.changes_required ? "Changes required" : "No changes needed"} />
      {row.changes_required ? (
        <>
          <Block label="Changes made" value={row.changes_made} />
          <div className="grid grid-cols-2 gap-3">
            <Block label="Date updated" value={showDate(row.date_updated)} />
            <Block label="Updated by" value={row.updated_by_name} />
          </div>
        </>
      ) : null}
      <Sig label="Administrator signature" name={row.admin_signed_name} at={row.admin_signed_at} />
    </article>
  );
}

export function DrillPrint({ row, printedAt }: { row: DrillRow; printedAt: string }) {
  return (
    <article className="packet-section">
      <DocHeader
        title="Emergency Drill / Exercise Report"
        period={periodLabel(row.year, row.quarter)}
        completed={row.finalized_at ?? row.exercise_date}
        printedAt={printedAt}
        draft={row.status !== "finalized"}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Block label="Exercise date" value={showDate(row.exercise_date)} />
        <Block label="Exercise type" value={labelFrom(EXERCISE_TYPES, row.exercise_type)} />
      </div>
      <Block label="Scenario" value={row.scenario} />
      <Block label="Participants" value={row.participants} />
      <Block label="What happened" value={row.what_happened} />
      <Block label="What worked" value={row.what_worked} />
      <Block label="What did not work" value={row.what_did_not_work} />
      <Block label="Problems identified" value={row.problems_identified} />
      <Block label="Corrective action" value={row.corrective_action} />
      <div className="grid grid-cols-2 gap-3">
        <Block label="Person responsible" value={row.person_responsible} />
        <Block label="Corrective action due date" value={showDate(row.corrective_due_date)} />
      </div>
      <Block
        label="Was the emergency plan updated?"
        value={row.plan_updated == null ? "—" : row.plan_updated ? "Yes" : "No"}
      />
      <Block label="Additional notes" value={row.additional_notes} />
      <Sig label="Administrator signature" name={row.admin_signed_name} at={row.admin_signed_at} />
    </article>
  );
}

export function OnCallPrint({
  rows,
  period,
  printedAt,
  attestation,
}: {
  rows: OnCallRow[];
  period: string;
  printedAt: string;
  attestation: AttestationRow | null;
}) {
  if (rows.length === 0) {
    return (
      <article className="packet-section">
        <DocHeader title="On-Call Log" period={period} completed={attestation?.signed_at ?? null} printedAt={printedAt} />
        {attestation ? (
          <div className="mt-8">
            <p className="text-lg text-slate-900">{attestation.statement || NIL_ON_CALL_STATEMENT}</p>
            <Block label="Reporting period" value={period} />
            <Block label="Administrator name" value={attestation.administrator_name} />
            <Sig label="Signature" name={attestation.signed_name} at={attestation.signed_at} />
          </div>
        ) : (
          <>
            <p className="mt-10 text-3xl font-bold tracking-wide">NOT COMPLETED</p>
            <p className="mt-3 text-sm text-slate-700">No calls were logged and no no-calls page was signed.</p>
          </>
        )}
      </article>
    );
  }

  return (
    <article className="packet-section">
      <DocHeader title="On-Call Log" period={period} completed={null} printedAt={printedAt} />
      <table className="mt-4 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="py-2 pr-2">Date/Time</th>
            <th className="py-2 pr-2">Patient</th>
            <th className="py-2 pr-2">Reason</th>
            <th className="py-2 pr-2">Handled by</th>
            <th className="py-2 pr-2">Action</th>
            <th className="py-2">Follow-up</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-200 align-top">
              <td className="py-2 pr-2">{formatAppDateTime(row.occurred_at)}</td>
              <td className="py-2 pr-2">{row.patient_name}</td>
              <td className="py-2 pr-2">{row.reason}</td>
              <td className="py-2 pr-2">{row.handled_by_name}</td>
              <td className="py-2 pr-2">{row.action_taken}</td>
              <td className="py-2">
                {row.follow_up_needed ? (row.follow_up_completed ? "Done" : "Needed") : "—"}
                {row.notes ? <span className="block text-xs text-slate-600">{row.notes}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

export function IncidentPrint({
  rows,
  period,
  printedAt,
}: {
  rows: IncidentRow[];
  period: string;
  printedAt: string;
}) {
  return (
    <article className="packet-section">
      <DocHeader title="Incident / Complaint Log" period={period} printedAt={printedAt} />
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-800">No incidents or complaints were entered for this quarter.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Patient</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">Action</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-200 align-top">
                <td className="py-2 pr-2">{showDate(row.occurred_on)}</td>
                <td className="py-2 pr-2">{row.patient_name || "—"}</td>
                <td className="py-2 pr-2">{labelFrom(INCIDENT_TYPES, row.incident_type)}</td>
                <td className="py-2 pr-2">{row.description}</td>
                <td className="py-2 pr-2">{row.action_taken || "—"}</td>
                <td className="py-2">
                  {row.resolved ? "Resolved" : row.follow_up_needed ? "Follow-up" : "Open"}
                  <span className="block text-xs text-slate-600">{row.handled_by_name || ""}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function QapiReviewPrint({ row, printedAt }: { row: QapiReviewRow; printedAt: string }) {
  const effective =
    row.previous_action_effective === "yes"
      ? "Yes"
      : row.previous_action_effective === "no"
        ? "No"
        : row.previous_action_effective === "not_applicable"
          ? "Not applicable"
          : "—";
  return (
    <article className="packet-section">
      <DocHeader
        title="Quarterly QAPI Review"
        period={periodLabel(row.year, row.quarter)}
        completed={row.finalized_at ?? row.review_date}
        printedAt={printedAt}
        draft={row.status !== "finalized"}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Block label="Review date" value={showDate(row.review_date)} />
        <Block label="Reviewed by" value={row.reviewed_by_name} />
      </div>
      {row.counts_overridden ? (
        <p className="mt-3 text-xs font-semibold text-slate-600">Some numbers were entered manually and differ from the incident log.</p>
      ) : null}
      <table className="mt-4 w-full text-sm">
        <tbody>
          {QAPI_COUNT_FIELDS.map(([key, label]) => (
            <tr key={key} className="border-b border-slate-200">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right font-semibold">{row[key] == null ? "—" : row[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Block label="Trends or concerns identified" value={row.trends} />
      <Block label="Corrective action / action plan" value={row.action_plan} />
      <Block label="Was the previous corrective action effective?" value={effective} />
      <Block label="Additional notes" value={row.additional_notes} />
      <Sig label="Administrator signature" name={row.admin_signed_name} at={row.admin_signed_at} />
      <Sig label="Clinical Director / RN signature" name={row.clinical_signed_name} at={row.clinical_signed_at} />
    </article>
  );
}

export function ProjectPrint({
  project,
  updates,
  printedAt,
}: {
  project: ProjectRow;
  updates: ProjectUpdateRow[];
  printedAt: string;
}) {
  const goal =
    project.goal_met === "yes" ? "Yes" : project.goal_met === "no" ? "No" : project.goal_met === "partially" ? "Partially" : "—";
  return (
    <article className="packet-section">
      <DocHeader
        title="QAPI Performance Improvement Project"
        period={project.start_date ? `Started ${showDate(project.start_date)}` : "Current project"}
        completed={project.completed_at}
        printedAt={printedAt}
      />
      <Block label="Project name" value={project.project_name} />
      <Block label="Status" value={labelFrom(PROJECT_STATUSES, project.status)} />
      <Block label="Problem identified" value={project.problem_identified} />
      <Block label="Reason project was selected" value={project.reason_selected} />
      <Block label="Baseline" value={project.baseline} />
      <Block label="Goal" value={project.goal} />
      <Block label="Action / intervention" value={project.action_intervention} />
      <div className="grid grid-cols-2 gap-3">
        <Block label="Responsible person" value={project.responsible_person} />
        <Block label="Target date" value={showDate(project.target_date)} />
      </div>
      <Block label="Current results" value={project.current_results} />
      <Block label="Outcome" value={project.outcome} />
      <Block label="Was goal met?" value={goal} />
      <Block label="Follow-up needed" value={project.follow_up_needed} />
      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Updates</h2>
      {updates.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">No updates entered.</p>
      ) : (
        <ul className="mt-2 space-y-3 text-sm">
          {updates.map((update) => (
            <li key={update.id} className="border-b border-slate-200 pb-2">
              <p className="font-semibold">
                {showDate(update.update_date)} · {update.entered_by_name || "Staff"}
              </p>
              <p className="whitespace-pre-wrap">{update.update_text}</p>
              {update.result ? <p className="text-slate-700">Result: {update.result}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function monthPeriodLabel(year: number, month: number): string {
  return monthLabel(year, month);
}
