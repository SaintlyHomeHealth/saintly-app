import Link from "next/link";
import { CPR_BLS_STATUS_LABELS, normalizeCprBlsStatusFromDb } from "@/lib/cpr-bls-status";

type OnboardingStatusLite = {
  application_completed?: boolean | null;
  onboarding_flow_status?: string | null;
  onboarding_progress_percent?: number | null;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_last_activity_at?: string | null;
} | null;

type WorkHistoryRow = {
  employer_name?: string | null;
  job_title?: string | null;
  city_state?: string | null;
  dates_employed?: string | null;
  primary_duties?: string | null;
  reason_for_leaving?: string | null;
};

type ReferenceRow = {
  name?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
};

type EmergencyRow = {
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_secondary?: string | null;
  emergency_medical_conditions?: string | null;
  emergency_allergies?: string | null;
  emergency_acknowledged?: boolean | null;
  emergency_full_name?: string | null;
  emergency_signed_at?: string | null;
};

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "cpr_bls_status" && typeof value === "string") {
    const normalized = normalizeCprBlsStatusFromDb(value);
    if (normalized && normalized in CPR_BLS_STATUS_LABELS) {
      return CPR_BLS_STATUS_LABELS[normalized as keyof typeof CPR_BLS_STATUS_LABELS];
    }
    return value;
  }
  if (key === "auto_insurance_file" && typeof value === "string" && value.trim()) {
    return "On file (see uploads)";
  }
  return String(value);
}

const CORE_FIELD_KEYS: { key: string; label: string }[] = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "position", label: "Position" },
  { key: "primary_discipline", label: "Primary discipline" },
  { key: "license_number", label: "License number" },
  { key: "years_experience", label: "Years experience" },
  { key: "preferred_hours", label: "Preferred hours" },
  { key: "availability_start_date", label: "Availability start" },
  { key: "work_setting", label: "Work setting" },
  { key: "type_of_position", label: "Type of position" },
  { key: "educational_level", label: "Education" },
  { key: "has_reliable_transportation", label: "Reliable transportation" },
  { key: "can_provide_transportation", label: "Can provide transportation" },
  { key: "drivers_license_state", label: "Driver license state" },
  { key: "drivers_license_expiration_date", label: "Driver license expiration" },
  { key: "auto_insurance_file", label: "Auto insurance (application)" },
  { key: "license_certification_number", label: "Certification number" },
  { key: "license_issuing_state", label: "License issuing state" },
  { key: "license_expiration_date", label: "License expiration" },
  { key: "cpr_bls_status", label: "CPR / BLS" },
  { key: "cpr_expiration_date", label: "CPR expiration" },
  { key: "other_certifications", label: "Other certifications" },
  { key: "has_conviction", label: "Conviction disclosure" },
  { key: "conviction_explanation", label: "Conviction explanation" },
  { key: "has_license_discipline", label: "License discipline" },
  { key: "license_discipline_explanation", label: "Discipline explanation" },
  { key: "needs_accommodation", label: "Needs accommodation" },
  { key: "accommodation_explanation", label: "Accommodation explanation" },
  { key: "attestation_full_name", label: "Attestation name" },
  { key: "attestation_date", label: "Attestation date" },
  { key: "attestation_acknowledged", label: "Attestation acknowledged" },
  { key: "status", label: "Applicant status" },
  { key: "created_at", label: "Applicant record created" },
  { key: "updated_at", label: "Applicant record updated" },
];

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

type Props = {
  employeeId: string;
  applicationViewHref: string;
  employee: Record<string, unknown>;
  onboardingStatus: OnboardingStatusLite;
  workHistory: WorkHistoryRow[];
  references: ReferenceRow[];
  emergency: EmergencyRow | null;
};

export default function AdminApplicationSnapshotSection({
  employeeId,
  applicationViewHref,
  employee,
  onboardingStatus,
  workHistory,
  references,
  emergency,
}: Props) {
  const appComplete = onboardingStatus?.application_completed === true;
  const statusLine = appComplete ? "Application submitted" : "Application in progress or not finalized";

  return (
    <section
      id="application-snapshot-section"
      className="mb-4 scroll-mt-24 border border-slate-200 bg-white"
      aria-labelledby="application-snapshot-heading"
    >
      <div className="border-b border-slate-100 px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="application-snapshot-heading" className="text-sm font-semibold text-slate-900">
              Submitted application (read-only)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Portal application responses as stored on the applicant record. Open the export for a printable
              snapshot.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${
                appComplete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {statusLine}
            </span>
            <Link
              href={applicationViewHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              View application
            </Link>
          </div>
        </div>
        <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-medium text-slate-500">Onboarding flow</dt>
            <dd className="text-slate-800">
              {onboardingStatus?.onboarding_flow_status?.replace(/_/g, " ") || "—"}
              {typeof onboardingStatus?.onboarding_progress_percent === "number"
                ? ` · ${onboardingStatus.onboarding_progress_percent}%`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Last portal activity</dt>
            <dd>{formatDateTime(onboardingStatus?.onboarding_last_activity_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Onboarding completed</dt>
            <dd>{formatDateTime(onboardingStatus?.onboarding_completed_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Onboarding started</dt>
            <dd>{formatDateTime(onboardingStatus?.onboarding_started_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Applicant ID</dt>
            <dd className="font-mono text-[11px]">{employeeId}</dd>
          </div>
        </dl>
      </div>

      <div className="px-3 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Application fields</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_FIELD_KEYS.map(({ key, label }) => (
            <ReadonlyField
              key={key}
              label={label}
              value={formatValue(key, employee[key])}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Work history</p>
        {workHistory.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No work history rows saved.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {workHistory.map((row, i) => (
              <li
                key={`wh-${i}`}
                className="rounded border border-slate-100 bg-slate-50/80 px-2 py-2 text-xs text-slate-800"
              >
                <p className="font-semibold text-slate-900">
                  {row.employer_name || "Employer"} — {row.job_title || "Role"}
                </p>
                <p className="mt-0.5 text-slate-600">{row.city_state || "—"} · {row.dates_employed || "—"}</p>
                <p className="mt-1 text-slate-700">
                  <span className="font-medium text-slate-600">Duties:</span> {row.primary_duties || "—"}
                </p>
                <p className="mt-0.5 text-slate-700">
                  <span className="font-medium text-slate-600">Leaving:</span> {row.reason_for_leaving || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 px-3 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">References</p>
        {references.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No references saved.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {references.map((row, i) => (
              <li
                key={`ref-${i}`}
                className="rounded border border-slate-100 bg-slate-50/80 px-2 py-2 text-xs text-slate-800"
              >
                <p className="font-semibold text-slate-900">{row.name || "Reference"}</p>
                <p className="text-slate-600">{row.relationship || "—"}</p>
                <p className="mt-0.5">
                  {row.phone || "—"} · {row.email || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {emergency &&
      (emergency.emergency_contact_name ||
        emergency.emergency_full_name ||
        emergency.emergency_acknowledged) ? (
        <div className="border-t border-slate-100 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <ReadonlyField label="Contact name" value={emergency.emergency_contact_name || "—"} />
            <ReadonlyField label="Relationship" value={emergency.emergency_contact_relationship || "—"} />
            <ReadonlyField label="Phone" value={emergency.emergency_contact_phone || "—"} />
            <ReadonlyField label="Secondary" value={emergency.emergency_contact_secondary || "—"} />
            <ReadonlyField
              label="Medical conditions"
              value={emergency.emergency_medical_conditions || "—"}
            />
            <ReadonlyField label="Allergies" value={emergency.emergency_allergies || "—"} />
            <ReadonlyField
              label="Acknowledged"
              value={
                emergency.emergency_acknowledged === null || emergency.emergency_acknowledged === undefined
                  ? "—"
                  : emergency.emergency_acknowledged
                    ? "Yes"
                    : "No"
              }
            />
            <ReadonlyField label="Signer name" value={emergency.emergency_full_name || "—"} />
            <ReadonlyField label="Signed at" value={formatDateTime(emergency.emergency_signed_at)} />
          </div>
        </div>
      ) : null}

      <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        Additional columns (if any) may appear in{" "}
        <Link href={applicationViewHref} className="font-semibold text-sky-700 underline" target="_blank">
          View application
        </Link>{" "}
        export.
      </div>
    </section>
  );
}
