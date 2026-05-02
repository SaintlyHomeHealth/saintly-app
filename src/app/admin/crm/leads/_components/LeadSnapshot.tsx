import type { ReactNode } from "react";

import type { EmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import type { LeadIntakeRequestDetails } from "@/lib/crm/lead-intake-request";
import { hasAnyIntakeRequestDetail } from "@/lib/crm/lead-intake-request";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import {
  leadDisplayPrimaryPayerName,
  leadDisplayPrimaryPayerTypeLine,
  leadDisplaySecondaryPayerName,
  leadInsuranceDisplayLines,
} from "@/lib/crm/lead-payer-structured";

import type { LeadWorkspaceContactProfileDefaults, LeadWorkspaceIntakeDefaults, LeadWorkspaceStaffOption } from "../lead-workspace";
import { leadTemperatureLabel, normalizeLeadTemperature } from "@/lib/crm/lead-temperature";
import { setLeadWaitingOnDoctorsOrders } from "@/app/admin/crm/actions";
import { LeadSnapshotCopyButton, LeadSnapshotMedicareReveal } from "./lead-snapshot-client";
import { LeadDeleteButton } from "./LeadDeleteButton";

function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMaybeTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string" || !iso.trim()) return "";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function staffLabel(staffOptions: LeadWorkspaceStaffOption[], ownerUid: string): string {
  if (!ownerUid.trim()) return "";
  const s = staffOptions.find((x) => x.user_id === ownerUid);
  if (!s) return ownerUid.slice(0, 8) + "…";
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) return em;
  return `${s.user_id.slice(0, 8)}…`;
}

function phoneLine(v: string): ReactNode {
  const t = v.trim();
  if (!t) return <span className="text-slate-400">Not provided</span>;
  return <span className="tabular-nums">{formatPhoneNumber(t)}</span>;
}

function textOrMuted(v: string): ReactNode {
  const t = v.trim();
  if (!t) return <span className="text-slate-400">Not provided</span>;
  return <span className="text-slate-900">{t}</span>;
}

function Field({
  label,
  children,
  emphasis,
  className = "",
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm leading-snug ${emphasis ? "text-base font-semibold text-slate-950" : "text-slate-800"}`}>
        {children}
      </dd>
    </div>
  );
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "rose" | "emerald" | "sky" | "violet" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800 ring-slate-200/80",
    amber: "bg-amber-50 text-amber-950 ring-amber-200/80",
    rose: "bg-rose-50 text-rose-950 ring-rose-200/80",
    emerald: "bg-emerald-50 text-emerald-950 ring-emerald-200/80",
    sky: "bg-sky-50 text-sky-950 ring-sky-200/80",
    violet: "bg-violet-50 text-violet-950 ring-violet-200/80",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

function SubCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export type LeadSnapshotProps = {
  leadId: string;
  displayName: string;
  sourceRaw: string;
  rawStatus: string;
  contact: LeadWorkspaceContactProfileDefaults;
  dobIso: string | null;
  ownerUid: string;
  staffOptions: LeadWorkspaceStaffOption[];
  nextActionVal: string;
  followUpIso: string;
  followUpAtIso: string | null;
  lastContactAt: string | null;
  lastOutcome: string | null;
  intakeDefaults: LeadWorkspaceIntakeDefaults;
  intakeRequest: LeadIntakeRequestDetails;
  leadDisciplinesForForm: string[];
  applicationNotes: string;
  /** Lead notes from intake form / source notes (same as lead form notes). */
  referralSourceLine: string;
  medicareNumber: string;
  medicareEffectiveDateIso: string;
  medicareNotes: string;
  primaryInsurancePath: string | null;
  secondaryInsurancePath: string | null;
  isEmployeeLead: boolean;
  employmentMeta: EmploymentApplicationMeta | null;
  isConverted: boolean;
  isDead: boolean;
  patientId: string | null;
  /** Raw `leads.lead_temperature` (empty = unset). */
  leadTemperature: string;
  /** Pipeline terminal (converted / dead) — hides orders toggle. */
  terminal: boolean;
  /** `leads.waiting_on_doctors_orders` */
  waitingOnDoctorsOrders: boolean;
};

function buildSnapshotPlainText(p: LeadSnapshotProps): string {
  const lines: string[] = [];
  const L = (k: string, v: string) => {
    lines.push(`${k}: ${v || "—"}`);
  };

  lines.push(`Lead snapshot — ${p.displayName}`);
  L("Primary phone", p.contact.primaryPhone.trim() ? formatPhoneNumber(p.contact.primaryPhone) : "—");
  L("Secondary phone", p.contact.secondaryPhone.trim() ? formatPhoneNumber(p.contact.secondaryPhone) : "—");
  L("Email", p.contact.email.trim());
  L("DOB", p.dobIso ? fmtIsoDate(p.dobIso) : "—");
  const addr = [
    p.contact.address_line_1.trim(),
    p.contact.address_line_2.trim(),
    [p.contact.city, p.contact.state].filter(Boolean).join(", "),
    p.contact.zip.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  L("Address", addr);
  L("Lead source", formatLeadSourceLabel(p.sourceRaw));
  L("Pipeline status", formatLeadPipelineStatusLabel(p.rawStatus));
  L("Owner", staffLabel(p.staffOptions, p.ownerUid) || "—");
  L("Next action", formatLeadNextActionLabel(p.nextActionVal));
  L("Lead next follow-up", p.followUpIso ? fmtIsoDate(p.followUpIso) : "—");
  L("Lead priority", leadTemperatureLabel(normalizeLeadTemperature(p.leadTemperature)));
  L("Last contact", formatLeadLastContactSummary(p.lastContactAt, p.lastOutcome, p.rawStatus));

  if (!p.isEmployeeLead) {
    L(
      "Waiting on doctor's orders",
      p.waitingOnDoctorsOrders ? "YES — do not schedule/start until signed orders are received" : "No"
    );
    {
      const insLines = leadInsuranceDisplayLines(p.intakeDefaults);
      L("Insurance", insLines.length ? insLines.join("\n") : "—");
    }
    L("Medicare #", p.medicareNumber.trim() ? "(masked in UI)" : "—");
    L("Medicare effective", p.medicareEffectiveDateIso ? fmtIsoDate(p.medicareEffectiveDateIso) : "—");
    L("Medicare notes", p.medicareNotes.trim());
    L("Primary insurance card", p.primaryInsurancePath ? "Yes" : "No");
    L("Secondary insurance card", p.secondaryInsurancePath ? "Yes" : "No");
    L("Referral source", p.intakeDefaults.referral_source.trim() || p.referralSourceLine.trim());
    L("Referring doctor", p.intakeDefaults.referring_doctor_name.trim());
    L("Doctor office", p.intakeDefaults.doctor_office_name.trim());
    L("Office contact", p.intakeDefaults.doctor_office_contact_person.trim());
    L("Referring provider", p.intakeDefaults.referring_provider_name.trim());
    L("Referring provider phone", p.intakeDefaults.referring_provider_phone.trim());
    if (hasAnyIntakeRequestDetail(p.intakeRequest)) {
      L("Service needed", p.intakeRequest.service_needed.trim());
      L("PT timing", p.intakeRequest.pt_timing.trim());
      L("Wound type", p.intakeRequest.wound_type.trim());
      L("Situation", p.intakeRequest.situation.trim());
    }
    L("Lead notes", p.applicationNotes.trim());
  }

  return lines.join("\n");
}

export function LeadSnapshot(props: LeadSnapshotProps) {
  const {
    leadId,
    displayName,
    sourceRaw,
    rawStatus,
    contact,
    dobIso,
    ownerUid,
    staffOptions,
    nextActionVal,
    followUpIso,
    followUpAtIso,
    lastContactAt,
    lastOutcome,
    intakeDefaults,
    intakeRequest,
    leadDisciplinesForForm,
    applicationNotes,
    referralSourceLine,
    medicareNumber,
    medicareEffectiveDateIso,
    medicareNotes,
    primaryInsurancePath,
    secondaryInsurancePath,
    isEmployeeLead,
    employmentMeta,
    isConverted,
    isDead,
    patientId,
    leadTemperature,
    terminal,
    waitingOnDoctorsOrders,
  } = props;

  const addrParts = [
    contact.address_line_1.trim(),
    contact.address_line_2.trim(),
    [contact.city, contact.state].filter(Boolean).join(", "),
    contact.zip.trim(),
  ].filter(Boolean);
  const addressLine = addrParts.length > 0 ? addrParts.join(" · ") : "";

  const primaryPayerName = leadDisplayPrimaryPayerName(intakeDefaults);
  const primaryPayerTypeLine = leadDisplayPrimaryPayerTypeLine(intakeDefaults);
  const secondaryPayerName = leadDisplaySecondaryPayerName(intakeDefaults);
  const insuranceDisplayLines = leadInsuranceDisplayLines(intakeDefaults);
  const lowerPayer = `${primaryPayerName} ${secondaryPayerName} ${primaryPayerTypeLine}`.toLowerCase();

  const tempNorm = normalizeLeadTemperature(leadTemperature);
  const tempBadge =
    tempNorm === "hot" ? (
      <Badge tone="rose">Hot</Badge>
    ) : tempNorm === "warm" ? (
      <Badge tone="amber">Warm</Badge>
    ) : tempNorm === "cool" ? (
      <Badge tone="slate">Cool</Badge>
    ) : tempNorm === "dead" ? (
      <Badge tone="slate">Dead</Badge>
    ) : null;

  const flags: { key: string; node: ReactNode }[] = [];
  if (isEmployeeLead) flags.push({ key: "emp", node: <Badge tone="violet">New applicant</Badge> });
  if (rawStatus === "intake_in_progress") flags.push({ key: "hot", node: <Badge tone="amber">Hot</Badge> });
  if (!isEmployeeLead && (rawStatus === "new" || rawStatus === "new_applicant"))
    flags.push({ key: "new", node: <Badge tone="sky">New</Badge> });
  if (rawStatus === "waiting_on_documents") flags.push({ key: "docs", node: <Badge tone="amber">Need docs</Badge> });
  if (rawStatus === "verify_insurance") flags.push({ key: "ver", node: <Badge tone="violet">Verify insurance</Badge> });
  if (/humana/i.test(lowerPayer)) flags.push({ key: "humana", node: <Badge tone="emerald">Humana</Badge> });
  if (intakeDefaults.primary_payer_type.trim() === "medicare_advantage") {
    flags.push({ key: "ma", node: <Badge tone="sky">Medicare Advantage</Badge> });
  }
  if (!contact.primaryPhone.trim()) flags.push({ key: "nophone", node: <Badge tone="rose">Missing phone</Badge> });
  if (!contact.email.trim()) flags.push({ key: "noemail", node: <Badge tone="rose">Missing email</Badge> });
  if (!isEmployeeLead && !primaryPayerName.trim()) flags.push({ key: "nopayer", node: <Badge tone="rose">Missing payer</Badge> });
  if (isConverted) flags.push({ key: "conv", node: <Badge tone="emerald">Patient stage</Badge> });
  if (isDead) flags.push({ key: "dead", node: <Badge tone="slate">Dead lead</Badge> });

  const plainText = buildSnapshotPlainText(props);

  const requestedServiceLine = intakeRequest.service_needed.trim();

  return (
    <section
      id="section-snapshot"
      className="scroll-mt-28 rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white via-slate-50/40 to-slate-50/80 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 sm:p-7"
    >
      {!isEmployeeLead && waitingOnDoctorsOrders ? (
        <div
          role="alert"
          className="mb-5 rounded-xl border-2 border-rose-600 bg-gradient-to-r from-rose-100 via-rose-50 to-amber-50 px-4 py-3 shadow-[0_4px_20px_rgba(190,18,60,0.2)]"
        >
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-rose-950">
            WAITING ON DOCTOR&apos;S ORDERS
          </p>
          <p className="mt-1.5 text-sm font-medium leading-snug text-rose-950/95">
            Do not schedule/start until signed orders are received.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead snapshot</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.65rem]">{displayName}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatLeadSourceLabel(sourceRaw)}
            {isEmployeeLead ? (
              <>
                {" · "}
                <span className="font-medium text-slate-800">Employee applicant</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <LeadSnapshotCopyButton text={plainText} />
          <LeadDeleteButton leadId={leadId} variant="detail" />
        </div>
      </div>

      {!isEmployeeLead && !terminal ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200/90 bg-rose-50/40 px-4 py-3 ring-1 ring-rose-100/80">
          <form action={setLeadWaitingOnDoctorsOrders} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="value" value={waitingOnDoctorsOrders ? "0" : "1"} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-900/90">Orders hold</span>
            <button
              type="submit"
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
                waitingOnDoctorsOrders
                  ? "bg-rose-600 text-white shadow-[0_2px_12px_rgba(190,24,93,0.35)] hover:bg-rose-700"
                  : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              }`}
              aria-pressed={waitingOnDoctorsOrders}
            >
              Waiting on Doctor&apos;s Orders
            </button>
            <span className="text-[11px] text-rose-900/80">Turn on when unsigned orders block scheduling.</span>
          </form>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SubCard title="Identity">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" emphasis>
              <span className="text-lg font-semibold tracking-tight">{displayName}</span>
            </Field>
            <Field label="Primary phone" emphasis>
              {phoneLine(contact.primaryPhone)}
            </Field>
            <Field label="Caregiver / alternate phone">{phoneLine(contact.secondaryPhone)}</Field>
            <Field label="Email">{textOrMuted(contact.email)}</Field>
            <Field label="Date of birth">{dobIso ? fmtIsoDate(dobIso) : <span className="text-slate-400">Not provided</span>}</Field>
            <Field label="Address" className="sm:col-span-2">
              {addressLine ? (
                <span className="whitespace-pre-wrap text-slate-800">{addressLine}</span>
              ) : (
                <span className="text-slate-400">Not provided</span>
              )}
            </Field>
          </dl>
        </SubCard>

        <SubCard title="Lead status & workflow">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Lead source" emphasis>
              {formatLeadSourceLabel(sourceRaw)}
            </Field>
            <Field label="Pipeline status" emphasis>
              {formatLeadPipelineStatusLabel(rawStatus)}
            </Field>
            <Field label="Owner">{textOrMuted(staffLabel(staffOptions, ownerUid))}</Field>
            <Field label="Next action" emphasis>
              {formatLeadNextActionLabel(nextActionVal)}
            </Field>
            <Field label="Lead next follow-up" emphasis>
              {followUpIso ? (
                <span>
                  {fmtIsoDate(followUpIso)}
                  {followUpAtIso ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">({fmtMaybeTime(followUpAtIso)})</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-slate-400">Not provided</span>
              )}
            </Field>
            <Field label="Lead priority" emphasis>
              {tempBadge ?? <span className="text-slate-400">Not set</span>}
            </Field>
            <Field label="Last contact / outcome" emphasis>
              <span className="font-medium text-slate-900">
                {formatLeadLastContactSummary(lastContactAt, lastOutcome, rawStatus)}
              </span>
            </Field>
          </dl>
        </SubCard>
      </div>

      {!isEmployeeLead ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SubCard title="Insurance">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Coverage" emphasis className="sm:col-span-2">
                {insuranceDisplayLines.length > 0 ? (
                  <div className="space-y-1.5 text-slate-900">
                    {insuranceDisplayLines.map((line, i) => (
                      <p key={`ins-${i}`} className="leading-snug">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Medicare number" className="sm:col-span-2">
                <LeadSnapshotMedicareReveal medicareNumber={medicareNumber} />
              </Field>
              <Field label="Medicare effective date">
                {medicareEffectiveDateIso ? (
                  fmtIsoDate(medicareEffectiveDateIso)
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Medicare notes" className="sm:col-span-2">
                {medicareNotes.trim() ? (
                  <span className="whitespace-pre-wrap text-slate-800">{medicareNotes.trim()}</span>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Primary insurance card">
                <span className={primaryInsurancePath ? "font-medium text-emerald-800" : "text-slate-400"}>
                  {primaryInsurancePath ? "Uploaded" : "Not uploaded"}
                </span>
              </Field>
              <Field label="Secondary insurance card">
                <span className={secondaryInsurancePath ? "font-medium text-emerald-800" : "text-slate-400"}>
                  {secondaryInsurancePath ? "Uploaded" : "Not uploaded"}
                </span>
              </Field>
            </dl>
          </SubCard>

          <SubCard title="Referral & intake">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Referral source" className="sm:col-span-2">
                {textOrMuted(intakeDefaults.referral_source || referralSourceLine)}
              </Field>
              <Field label="Referring doctor">{textOrMuted(intakeDefaults.referring_doctor_name)}</Field>
              <Field label="Doctor / office">{textOrMuted(intakeDefaults.doctor_office_name)}</Field>
              <Field label="Doctor office phone">{phoneLine(intakeDefaults.doctor_office_phone)}</Field>
              <Field label="Doctor office fax">{phoneLine(intakeDefaults.doctor_office_fax)}</Field>
              {intakeDefaults.doctor_office_contact_person.trim() ? (
                <Field label="Office contact person" className="sm:col-span-2">
                  {textOrMuted(intakeDefaults.doctor_office_contact_person)}
                </Field>
              ) : null}
              {intakeDefaults.referring_provider_name.trim() || intakeDefaults.referring_provider_phone.trim() ? (
                <>
                  <Field label="Referring provider / agency">{textOrMuted(intakeDefaults.referring_provider_name)}</Field>
                  <Field label="Referring provider phone">{phoneLine(intakeDefaults.referring_provider_phone)}</Field>
                </>
              ) : null}
              <Field label="Requested service / reason" className="sm:col-span-2" emphasis>
                {requestedServiceLine ? (
                  <span className="whitespace-pre-wrap">{requestedServiceLine}</span>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Requested disciplines" className="sm:col-span-2">
                {leadDisciplinesForForm.length > 0 ? (
                  <span>{leadDisciplinesForForm.join(", ")}</span>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Intake notes (form)" className="sm:col-span-2">
                {hasAnyIntakeRequestDetail(intakeRequest) ? (
                  <div className="space-y-1 text-sm text-slate-800">
                    {intakeRequest.zip_code.trim() ? (
                      <p>
                        <span className="text-slate-500">ZIP:</span> {intakeRequest.zip_code}
                      </p>
                    ) : null}
                    {intakeRequest.care_for.trim() ? (
                      <p>
                        <span className="text-slate-500">Care for:</span> {intakeRequest.care_for}
                      </p>
                    ) : null}
                    {intakeRequest.start_time.trim() ? (
                      <p>
                        <span className="text-slate-500">Start time:</span> {intakeRequest.start_time}
                      </p>
                    ) : null}
                    {intakeRequest.pt_timing.trim() ? (
                      <p>
                        <span className="text-slate-500">PT timing:</span> {intakeRequest.pt_timing}
                      </p>
                    ) : null}
                    {intakeRequest.wound_type.trim() ? (
                      <p>
                        <span className="text-slate-500">Wound type:</span> {intakeRequest.wound_type}
                      </p>
                    ) : null}
                    {intakeRequest.situation.trim() ? (
                      <p className="whitespace-pre-wrap">
                        <span className="text-slate-500">Situation:</span> {intakeRequest.situation}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
              <Field label="Lead notes (general)" className="sm:col-span-2">
                {applicationNotes.trim() ? (
                  <span className="whitespace-pre-wrap text-slate-800">{applicationNotes.trim()}</span>
                ) : (
                  <span className="text-slate-400">Not provided</span>
                )}
              </Field>
            </dl>
          </SubCard>
        </div>
      ) : (
        <div className="mt-4">
          <SubCard title="Applicant">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Role applied for">{textOrMuted((employmentMeta?.position ?? "").trim())}</Field>
              <Field label="License #">{textOrMuted((employmentMeta?.license_number ?? "").trim())}</Field>
              <Field label="Available start">{textOrMuted((employmentMeta?.available_start_date ?? "").trim())}</Field>
              <Field label="Preferred hours">{textOrMuted((employmentMeta?.preferred_hours ?? "").trim())}</Field>
            </dl>
          </SubCard>
        </div>
      )}

      {flags.length > 0 ? (
        <div className="mt-4">
          <SubCard title="Key flags">
            <div className="flex flex-wrap gap-2">{flags.map((f) => <span key={f.key}>{f.node}</span>)}</div>
          </SubCard>
        </div>
      ) : null}

      {isConverted && patientId ? (
        <p className="mt-4 text-xs text-emerald-700">
          Patient stage — open the patient chart from the Outcome section below.
        </p>
      ) : null}
    </section>
  );
}
