import type { ReactNode } from "react";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { formatAppDate } from "@/lib/datetime/app-timezone";
import { extractAgeFromDob } from "@/lib/crm/patient-referral/normalize";
import { buildCaregiverAlternateSummary } from "@/lib/crm/patient-caregiver-display";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm leading-snug text-slate-800">{children}</dd>
    </div>
  );
}

function textOrMuted(v: string | null | undefined): ReactNode {
  const t = (v ?? "").trim();
  if (!t) return <span className="text-slate-400">—</span>;
  return t;
}

function SubCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

export type PatientSnapshotCardProps = {
  displayName: string;
  patientStatus: string | null;
  dateOfBirth: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  relationshipMetadata: unknown;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  payerName: string | null;
  payerType: string | null;
  medicareNumber: string | null;
  medicaidId: string | null;
  intakeStatus: string | null;
  diagnosisText: string | null;
  diagnosisCode: string | null;
  disciplines: string[];
  visitPlanSummary: string | null;
  primaryNurseLabel: string | null;
  assignedClinicianLabels: string[];
  referralSource: string | null;
  referralSourcePhone: string | null;
  referringDoctor: string | null;
  referralReceivedAt: string | null;
  leadSourceLabel: string | null;
};

export function PatientSnapshotCard(props: PatientSnapshotCardProps) {
  const {
    displayName,
    patientStatus,
    dateOfBirth,
    primaryPhone,
    secondaryPhone,
    relationshipMetadata,
    address,
    payerName,
    payerType,
    medicareNumber,
    medicaidId,
    intakeStatus,
    diagnosisText,
    diagnosisCode,
    disciplines,
    visitPlanSummary,
    primaryNurseLabel,
    assignedClinicianLabels,
    referralSource,
    referralSourcePhone,
    referringDoctor,
    referralReceivedAt,
    leadSourceLabel,
  } = props;

  const dobDisplay = dateOfBirth?.trim()
    ? formatAppDate(`${dateOfBirth.slice(0, 10)}T12:00:00Z`, "—", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const age = dateOfBirth ? extractAgeFromDob(dateOfBirth.slice(0, 10)) : null;
  const dobAgeLine =
    dobDisplay && age != null ? `${dobDisplay} (${age} yrs)` : dobDisplay ?? null;

  const caregiverSummary = buildCaregiverAlternateSummary({
    secondaryPhone,
    relationshipMetadata,
  });

  const cityLine = [address.city, [address.state, address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50/80 to-white p-5 shadow-sm ring-1 ring-slate-200/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Patient snapshot</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{displayName}</h2>
          {patientStatus ? (
            <p className="mt-0.5 text-sm capitalize text-slate-600">{patientStatus.replace(/_/g, " ")}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <SubCard title="Patient">
          <Field label="Status">{textOrMuted(patientStatus?.replace(/_/g, " ") ?? null)}</Field>
          <Field label="DOB / age">{textOrMuted(dobAgeLine)}</Field>
          <Field label="Phone">{formatPhoneForDisplay(primaryPhone ?? "") || <span className="text-slate-400">—</span>}</Field>
          <Field label="Caregiver / alternate">
            {caregiverSummary.isEmpty ? (
              <span className="text-slate-400">—</span>
            ) : (
              <div className="space-y-0.5">
                {caregiverSummary.secondaryLine ? <p className="tabular-nums">{caregiverSummary.secondaryLine}</p> : null}
                {caregiverSummary.metadataLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </Field>
          <Field label="Address" className="sm:col-span-2">
            {!address.line1 && !address.line2 && !cityLine ? (
              <span className="text-slate-400">—</span>
            ) : (
              <div className="space-y-0.5">
                {address.line1 ? <p>{address.line1}</p> : null}
                {address.line2 ? <p>{address.line2}</p> : null}
                {cityLine ? <p>{cityLine}</p> : null}
              </div>
            )}
          </Field>
        </SubCard>

        <SubCard title="Insurance / payer">
          <Field label="Payer">{textOrMuted(payerName)}</Field>
          <Field label="Payer type">{textOrMuted(payerType)}</Field>
          <Field label="Medicare / MBI">{textOrMuted(medicareNumber)}</Field>
          <Field label="Medicaid / AHCCCS ID">{textOrMuted(medicaidId)}</Field>
          <Field label="Intake / eligibility">{textOrMuted(intakeStatus)}</Field>
        </SubCard>

        <SubCard title="Clinical">
          <Field label="Diagnosis">{textOrMuted(diagnosisText)}</Field>
          <Field label="ICD-10">{textOrMuted(diagnosisCode)}</Field>
          <Field label="Disciplines ordered">
            {disciplines.length > 0 ? disciplines.join(", ") : <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Visit plan / frequency">{textOrMuted(visitPlanSummary)}</Field>
          <Field label="Primary nurse">{textOrMuted(primaryNurseLabel)}</Field>
          <Field label="Assigned clinicians" className="sm:col-span-2">
            {assignedClinicianLabels.length > 0 ? (
              assignedClinicianLabels.join(" · ")
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </Field>
        </SubCard>

        <SubCard title="Referral">
          <Field label="Referral source">{textOrMuted(referralSource)}</Field>
          <Field label="Referral source phone">
            {referralSourcePhone ? formatPhoneForDisplay(referralSourcePhone) : <span className="text-slate-400">—</span>}
          </Field>
          <Field label="Referring provider / doctor">{textOrMuted(referringDoctor)}</Field>
          <Field label="Referral date">
            {referralReceivedAt
              ? formatAppDate(referralReceivedAt, "—", { month: "short", day: "numeric", year: "numeric" })
              : textOrMuted(null)}
          </Field>
          <Field label="Lead source">{textOrMuted(leadSourceLabel)}</Field>
        </SubCard>
      </div>
    </section>
  );
}
