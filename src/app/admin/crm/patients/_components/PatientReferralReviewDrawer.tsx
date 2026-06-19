"use client";

import {
  crmFilterInputCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { PATIENT_REFERRAL_SOURCE_OPTIONS } from "@/lib/crm/patient-referral/options";
import type { PatientReferralParsePayload } from "@/lib/crm/patient-referral/types";
import type { PatientReferralReviewFormState } from "@/lib/crm/patient-referral/suggestions-to-form";

const inp = `${crmFilterInputCls} mt-1 w-full`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  required,
  warning,
  className,
}: {
  label: string;
  name: keyof PatientReferralReviewFormState;
  value: string;
  onChange: (name: keyof PatientReferralReviewFormState, value: string) => void;
  type?: string;
  required?: boolean;
  warning?: string;
  className?: string;
}) {
  return (
    <label className={className ?? ""}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        type={type}
        name={name}
        value={value}
        className={inp}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {warning ? <p className="mt-1 text-[11px] text-amber-800">{warning}</p> : null}
    </label>
  );
}

function parseStatusBannerClass(quality: PatientReferralParsePayload["quality"]): string {
  switch (quality) {
    case "parsed_ok":
    case "tango_parsed":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "limited_parse":
    case "needs_review":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "ocr_success":
    case "ocr_limited":
      return "border-sky-200 bg-sky-50 text-sky-950";
    default:
      return "border-slate-200 bg-slate-50 text-slate-900";
  }
}

type PatientReferralReviewDrawerProps = {
  open: boolean;
  fileName: string;
  parse: PatientReferralParsePayload | null;
  form: PatientReferralReviewFormState;
  onChange: (name: keyof PatientReferralReviewFormState, value: string) => void;
  pending: boolean;
  onClose: () => void;
  onCreatePatient: () => void;
  onSaveReferralOnly: () => void;
  attachPatientId?: string | null;
  onViewFile?: () => void;
};

export function PatientReferralReviewDrawer({
  open,
  fileName,
  parse,
  form,
  onChange,
  pending,
  onClose,
  onCreatePatient,
  onSaveReferralOnly,
  attachPatientId,
  onViewFile,
}: PatientReferralReviewDrawerProps) {
  if (!open) return null;

  const missingFirst = !form.first_name.trim();
  const missingLast = !form.last_name.trim();
  const missingContact = !form.phone.trim() && !form.address_line_1.trim() && !form.city.trim();

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40">
      <div className="flex h-full w-full max-w-3xl flex-col bg-slate-50 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Review Referral</h2>
            <p className="mt-1 text-sm text-slate-600">
              File: <span className="font-medium text-slate-800">{fileName}</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={pending}
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {parse ? (
            <div className={`rounded-xl border px-4 py-3 text-sm ${parseStatusBannerClass(parse.quality)}`} role="status">
              <p className="font-semibold">{parse.statusHeadline ?? "Parse status"}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {parse.messages.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Section title="Patient Information">
            <Field label="First name" name="first_name" value={form.first_name} onChange={onChange} required warning={missingFirst ? "Required" : undefined} />
            <Field label="Last name" name="last_name" value={form.last_name} onChange={onChange} required warning={missingLast ? "Required" : undefined} />
            <Field label="Full name" name="full_name" value={form.full_name} onChange={onChange} className="sm:col-span-2" />
            <Field label="Date of birth" name="date_of_birth" value={form.date_of_birth} onChange={onChange} type="date" />
            <Field label="Age" name="age" value={form.age} onChange={onChange} />
            <Field label="Sex" name="sex" value={form.sex} onChange={onChange} />
          </Section>

          <Section title="Address & Contact">
            <Field label="Phone" name="phone" value={form.phone} onChange={onChange} warning={missingContact ? "Phone or address required" : undefined} />
            <Field label="Alternate phone" name="alternate_phone" value={form.alternate_phone} onChange={onChange} />
            <Field label="Address line 1" name="address_line_1" value={form.address_line_1} onChange={onChange} className="sm:col-span-2" />
            <Field label="Address line 2" name="address_line_2" value={form.address_line_2} onChange={onChange} className="sm:col-span-2" />
            <Field label="City" name="city" value={form.city} onChange={onChange} />
            <Field label="State" name="state" value={form.state} onChange={onChange} />
            <Field label="ZIP" name="zip" value={form.zip} onChange={onChange} />
            <Field label="Emergency contact 1" name="emergency_contact_1_name" value={form.emergency_contact_1_name} onChange={onChange} />
            <Field label="Emergency phone 1" name="emergency_contact_1_phone" value={form.emergency_contact_1_phone} onChange={onChange} />
          </Section>

          <Section title="Referral Source">
            <label className="sm:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Referral source <span className="text-rose-600">*</span>
              </span>
              <select
                className={inp}
                value={form.referral_source_type}
                onChange={(e) => onChange("referral_source_type", e.target.value)}
              >
                <option value="">Select source…</option>
                {PATIENT_REFERRAL_SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Source name" name="referral_source_name" value={form.referral_source_name} onChange={onChange} />
            <Field label="Referral facility" name="referral_facility" value={form.referral_facility} onChange={onChange} />
            <Field label="Contact person" name="source_contact_name" value={form.source_contact_name} onChange={onChange} />
            <Field label="Source phone" name="source_phone" value={form.source_phone} onChange={onChange} />
            <Field label="Source fax" name="source_fax" value={form.source_fax} onChange={onChange} />
            <Field label="Source email" name="source_email" value={form.source_email} onChange={onChange} />
            {form.referral_source_type === "sales_agent" ? (
              <Field label="Sales agent name" name="sales_agent_name" value={form.sales_agent_name} onChange={onChange} className="sm:col-span-2" />
            ) : null}
            <Field label="Received date" name="referral_received_date" value={form.referral_received_date} onChange={onChange} type="date" />
            <Field label="Requested SOC" name="requested_soc_date" value={form.requested_soc_date} onChange={onChange} type="date" />
            <Field label="Best available SOC" name="best_available_soc_date" value={form.best_available_soc_date} onChange={onChange} type="date" />
            <Field label="Discharge date" name="discharge_date" value={form.discharge_date} onChange={onChange} type="date" />
            <Field label="Intake status" name="intake_status" value={form.intake_status} onChange={onChange} required />
          </Section>

          <Section title="Physicians">
            <Field label="Ordering physician" name="ordering_physician_name" value={form.ordering_physician_name} onChange={onChange} />
            <Field label="Ordering phone" name="ordering_physician_phone" value={form.ordering_physician_phone} onChange={onChange} />
            <Field label="Ordering fax" name="ordering_physician_fax" value={form.ordering_physician_fax} onChange={onChange} />
            <Field label="PCP" name="pcp_name" value={form.pcp_name} onChange={onChange} />
            <Field label="PCP phone" name="pcp_phone" value={form.pcp_phone} onChange={onChange} />
            <Field label="Following physician" name="following_physician_name" value={form.following_physician_name} onChange={onChange} />
          </Section>

          <Section title="Insurance / Authorization">
            <Field label="Insurance" name="insurance_name" value={form.insurance_name} onChange={onChange} />
            <Field label="Payer type" name="payer_type" value={form.payer_type} onChange={onChange} />
            <Field label="Member ID" name="member_id" value={form.member_id} onChange={onChange} />
            <Field label="Medicaid ID" name="medicaid_id" value={form.medicaid_id} onChange={onChange} />
            <Field label="MBI" name="mbi" value={form.mbi} onChange={onChange} />
            <Field label="Authorization #" name="authorization_number" value={form.authorization_number} onChange={onChange} />
            <Field label="Auth type" name="authorization_type" value={form.authorization_type} onChange={onChange} />
            <Field label="Bill type" name="authorization_bill_type" value={form.authorization_bill_type} onChange={onChange} />
            <Field label="Effective start" name="authorization_effective_start" value={form.authorization_effective_start} onChange={onChange} type="date" />
            <Field label="Effective end" name="authorization_effective_end" value={form.authorization_effective_end} onChange={onChange} type="date" />
          </Section>

          <Section title="Disciplines & Visits">
            <Field label="SN visits" name="skilled_nursing_visits" value={form.skilled_nursing_visits} onChange={onChange} />
            <Field label="PT visits" name="pt_visits" value={form.pt_visits} onChange={onChange} />
            <Field label="OT visits" name="ot_visits" value={form.ot_visits} onChange={onChange} />
            <Field label="ST visits" name="st_visits" value={form.st_visits} onChange={onChange} />
            <Field label="MSW visits" name="msw_visits" value={form.msw_visits} onChange={onChange} />
            <Field label="HHA visits" name="hha_visits" value={form.hha_visits} onChange={onChange} />
            <Field label="Approved disciplines" name="approved_disciplines" value={form.approved_disciplines} onChange={onChange} className="sm:col-span-2" />
            <Field label="Agency assigned" name="agency_assigned" value={form.agency_assigned} onChange={onChange} className="sm:col-span-2" />
          </Section>

          <Section title="Notes">
            <Field label="Chief complaint" name="chief_complaint" value={form.chief_complaint} onChange={onChange} className="sm:col-span-2" />
            <Field label="Diagnosis" name="diagnosis_text" value={form.diagnosis_text} onChange={onChange} className="sm:col-span-2" />
            <Field label="Allergies" name="allergies" value={form.allergies} onChange={onChange} className="sm:col-span-2" />
            <label className="sm:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Notes</span>
              <textarea
                className={`${inp} min-h-[80px]`}
                value={form.notes}
                onChange={(e) => onChange("notes", e.target.value)}
              />
            </label>
          </Section>

          <section className="rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Uploaded Documents</h3>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                <p className="font-medium text-slate-800">{fileName}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Type: {form.document_type?.trim() || parse?.documentType || "referral"} · Parse:{" "}
                  {parse?.quality ?? "manual"}
                </p>
              </div>
              {onViewFile ? (
                <button
                  type="button"
                  className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  onClick={onViewFile}
                >
                  View file
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Document will be attached when you create or save the referral.</p>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={pending}
            onClick={onSaveReferralOnly}
          >
            Save as Referral Only
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="button" className={crmPrimaryCtaCls} disabled={pending} onClick={onCreatePatient}>
              {pending
                ? "Saving…"
                : attachPatientId
                  ? "Update Existing Patient"
                  : "Create Patient"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
