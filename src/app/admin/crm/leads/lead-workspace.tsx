import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { PayerTypeSelect } from "@/components/crm/PayerTypeSelect";
import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";
import { LEAD_NEXT_ACTION_OPTIONS } from "@/lib/crm/lead-follow-up-options";
import {
  formatLeadPipelineStatusLabel,
  isLeadPipelineTerminal,
  LEAD_PIPELINE_STATUS_EDITABLE_OPTIONS,
} from "@/lib/crm/lead-pipeline-status";
import { LEAD_SOURCE_OPTIONS, formatLeadSourceLabel } from "@/lib/crm/lead-source-options";

import { LeadContactOutcomeForm } from "@/app/admin/crm/leads/_components/LeadContactOutcomeForm";
import { LeadFollowUpContextPanel } from "@/app/admin/crm/leads/_components/LeadFollowUpContextPanel";
import { LeadInsuranceSection } from "@/app/admin/crm/leads/_components/LeadInsuranceSection";
import { LeadMedicareFields } from "@/app/admin/crm/leads/_components/LeadMedicareFields";
import type { LeadActivityRow } from "@/lib/crm/lead-activities-timeline";
import { LeadSectionCard } from "@/app/admin/crm/leads/_components/LeadSectionCard";
import { LeadSnapshot } from "@/app/admin/crm/leads/_components/LeadSnapshot";
import {
  convertLeadToPatientFromLeadDetail,
  createLeadManualFromCrm,
  markLeadDead,
  updateLeadContactProfile,
  updateLeadIntake,
} from "../actions";
import type { EmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import { hasAnyIntakeRequestDetail, type LeadIntakeRequestDetails } from "@/lib/crm/lead-intake-request";
import { addCalendarDaysToIsoDate, getCrmCalendarTodayIso, getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

export const leadWorkspaceInputCls =
  "mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

export type LeadWorkspaceStaffOption = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

function staffOptionLabel(s: LeadWorkspaceStaffOption): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) return em;
  return `${s.user_id.slice(0, 8)}…`;
}

function convertErrorMessage(code: string): string {
  switch (code) {
    case "already_converted":
      return "This lead is already converted.";
    case "lead_dead":
      return "This lead is marked dead and cannot be converted.";
    case "patient_exists":
      return "A patient already exists for this contact.";
    case "forbidden":
      return "Not allowed.";
    case "insert_failed":
      return "Could not create the patient record.";
    case "update_failed":
      return "Patient was created but the lead status could not be updated.";
    default:
      return "Could not convert. Try again or open the patient manually.";
  }
}

function createLeadErrorMessage(code: string): string {
  switch (code) {
    case "forbidden":
      return "You do not have permission to create a lead.";
    case "validation_name":
      return "First name and last name are required.";
    case "validation_phone":
      return "Primary phone is required.";
    case "validation_source":
      return "Choose a valid source.";
    case "contact_insert_failed":
      return "Could not save the contact. Check required fields and try again.";
    case "lead_insert_failed":
      return "Could not create the lead record.";
    default:
      return "Something went wrong.";
  }
}

export type LeadWorkspaceContactProfileDefaults = {
  fullName: string;
  primaryPhone: string;
  secondaryPhone: string;
  email: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

export type LeadWorkspaceIntakeDefaults = {
  referring_doctor_name: string;
  doctor_office_name: string;
  doctor_office_phone: string;
  doctor_office_fax: string;
  doctor_office_contact_person: string;
  referring_provider_name: string;
  referring_provider_phone: string;
  payer_name: string;
  payer_type: string;
  referral_source: string;
  intake_status: string;
};

export type LeadWorkspaceExistingProps = {
  mode: "existing";
  leadId: string;
  contactId: string;
  displayName: string;
  sourceRaw: string;
  rawStatus: string;
  pipelineDefault: string;
  terminal: boolean;
  isConverted: boolean;
  isDead: boolean;
  primaryPhone: string;
  patientId: string | null;
  convertErr: string;
  ownerUid: string;
  nextActionVal: string;
  followUpIso: string;
  /** Next follow-up instant from `leads.follow_up_at` (Central calendar date aligns with `follow_up_date`). */
  followUpAtIso: string | null;
  leadDisciplinesForForm: string[];
  intakeDefaults: LeadWorkspaceIntakeDefaults;
  contactProfileDefaults: LeadWorkspaceContactProfileDefaults;
  staffOptions: LeadWorkspaceStaffOption[];
  lastContactAt: string | null;
  lastOutcome: string | null;
  lastNote: string | null;
  leadCreatedAt: string | null;
  /** Hiring / employment website applicants (`leads.lead_type = employee`). */
  isEmployeeLead?: boolean;
  employmentMeta?: EmploymentApplicationMeta | null;
  referralSourceLine?: string;
  /** Raw `leads.notes` (application summary from intake). */
  applicationNotes?: string;
  /** Facebook / Zapier / manual — `external_source_metadata.intake_request` (+ graph fallback on server). */
  intakeRequestDefaults: LeadIntakeRequestDetails;
  /** `YYYY-MM-DD` from `leads.dob`. */
  dobIso: string | null;
  primaryInsurancePath: string | null;
  secondaryInsurancePath: string | null;
  primaryInsuranceViewUrl: string | null;
  secondaryInsuranceViewUrl: string | null;
  /** Typed Medicare fields (`leads.medicare_*`). */
  medicareNumber: string;
  medicareEffectiveDateIso: string;
  medicareNotes: string;
  /** Structured CRM thread (`lead_activities`). */
  initialActivities: LeadActivityRow[];
};

export type LeadWorkspaceNewProps = {
  mode: "new";
  createErrorCode: string;
  staffOptions: LeadWorkspaceStaffOption[];
};

export type LeadWorkspaceProps = LeadWorkspaceExistingProps | LeadWorkspaceNewProps;

export function LeadWorkspace(props: LeadWorkspaceProps) {
  const inp = leadWorkspaceInputCls;

  if (props.mode === "new") {
    const { createErrorCode, staffOptions } = props;
    const errMsg = createErrorCode ? createLeadErrorMessage(createErrorCode) : null;

    return (
      <div className="space-y-6 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">New lead</h1>
          <p className="mt-1 text-sm text-slate-600">
            Same layout as an open lead. After you save, you stay in this workspace on the lead record.{" "}
            <Link href="/admin/crm/leads" className="font-semibold text-sky-800 hover:underline">
              Back to leads
            </Link>
          </p>
        </div>

        {errMsg ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{errMsg}</div>
        ) : null}

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Communication</h2>
          <p className="mt-1 text-xs text-slate-500">
            Call and SMS use the contact&apos;s primary phone. Save the lead first, then you can reach out from this
            section on the next screen.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-400">Available after create</span>
          </div>
        </div>

        <div className="rounded-[28px] border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm ring-1 ring-indigo-100/60">
          <h2 className="text-sm font-semibold text-slate-900">Outcome</h2>
          <p className="mt-1 text-xs text-slate-600">
            Convert to patient or mark dead after the lead exists. Those actions appear here once you save.
          </p>
        </div>

        <form action={createLeadManualFromCrm} className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Pipeline &amp; ownership</h2>
            <p className="mt-1 text-xs text-slate-500">
              Contact details, source, and follow-up. Pipeline status starts as <strong>New</strong> (change it after
              save like any other lead).
            </p>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Contact</p>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                First name <span className="text-red-600">*</span>
                <input name="firstName" required autoComplete="given-name" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Last name <span className="text-red-600">*</span>
                <input name="lastName" required autoComplete="family-name" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Primary phone <span className="text-red-600">*</span>
                <FormattedPhoneInput name="primaryPhone" required className={inp} autoComplete="tel" />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Caregiver / alternate phone
                <FormattedPhoneInput name="secondary_phone" className={inp} autoComplete="tel" />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Email
                <input name="email" type="email" autoComplete="email" className={inp} />
              </label>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">Lead</p>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Source <span className="text-red-600">*</span>
                <select name="source" required className={inp} defaultValue="manual">
                  {LEAD_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Owner
                <select name="owner_user_id" className={inp} defaultValue="">
                  <option value="">— Unassigned —</option>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {staffOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Next action
                <select name="next_action" className={inp} defaultValue="">
                  <option value="">—</option>
                  {LEAD_NEXT_ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Follow-up date
                <input name="follow_up_date" type="date" className={inp} />
              </label>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Referral &amp; doctor office</h2>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Referring doctor name
                <input name="referring_doctor_name" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office name
                <input name="doctor_office_name" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office phone
                <FormattedPhoneInput name="doctor_office_phone" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office fax
                <FormattedPhoneInput name="doctor_office_fax" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Office contact person
                <input name="doctor_office_contact_person" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Referring provider / agency name (legacy)
                <input name="referring_provider_name" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Referring provider phone
                <FormattedPhoneInput name="referring_provider_phone" className={inp} />
              </label>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Payer &amp; services</h2>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Payer
                <SearchablePayerSelect name="payer_name" className={inp} id="lead-workspace-new-payer" />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Payer type (category)
                <PayerTypeSelect name="payer_type" className={inp} id="lead-workspace-new-payer-type" />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Referral source
                <input name="referral_source" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Service disciplines
                <ServiceDisciplineCheckboxes />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Intake status
                <input name="intake_status" className={inp} />
              </label>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Request details</h2>
            <p className="mt-1 text-xs text-slate-500">
              Same fields as Facebook / Zapier intake (stored on the lead record for reporting).
            </p>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                ZIP code
                <input name="intake_zip_code" autoComplete="postal-code" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Service needed
                <input name="intake_service_needed" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Care for
                <input name="intake_care_for" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Start time / timing
                <input name="intake_start_time" className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Situation
                <textarea name="intake_situation" rows={3} className={inp} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Lead notes (general)
                <textarea
                  name="lead_notes"
                  rows={3}
                  className={inp}
                  placeholder="Optional notes on this lead (separate from intake status)."
                />
              </label>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="rounded border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Create lead
            </button>
          </div>
        </form>
      </div>
    );
  }

  const {
    leadId,
    contactId,
    displayName,
    sourceRaw,
    rawStatus,
    pipelineDefault,
    terminal,
    isConverted,
    isDead,
    primaryPhone,
    patientId,
    convertErr,
    ownerUid,
    nextActionVal,
    followUpIso,
    followUpAtIso,
    leadDisciplinesForForm,
    intakeDefaults,
    contactProfileDefaults,
    staffOptions,
    lastContactAt,
    lastOutcome,
    lastNote,
    leadCreatedAt = null,
    isEmployeeLead = false,
    employmentMeta = null,
    referralSourceLine = "",
    applicationNotes = "",
    intakeRequestDefaults,
    dobIso,
    primaryInsurancePath,
    secondaryInsurancePath,
    primaryInsuranceViewUrl,
    secondaryInsuranceViewUrl,
    medicareNumber,
    medicareEffectiveDateIso,
    medicareNotes,
    initialActivities,
  } = props;

  const tomorrowIso = getCrmCalendarTomorrowIso();
  const voicemailSuggestedIso = addCalendarDaysToIsoDate(getCrmCalendarTodayIso(), 2);

  const dialE164 = pickOutboundE164ForDial(primaryPhone);
  const keypadHref = dialE164
    ? buildWorkspaceKeypadCallHref({
        dial: dialE164,
        leadId,
        contactId,
        contextName: displayName,
      })
    : null;
  const smsHref =
    contactId.trim() && pickOutboundE164ForDial(primaryPhone)
      ? buildWorkspaceSmsToContactHref({ contactId: contactId.trim(), leadId })
      : null;

  return (
    <div className="scroll-smooth p-6 pb-44 lg:pb-52">
      <div className="mb-5">
        <Link
          href="/admin/crm/leads"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          Back to leads
        </Link>
      </div>

      <nav
        aria-label="Jump to section"
        className="sticky top-0 z-30 mb-8 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur-md sm:px-5"
      >
        <ul className="flex flex-nowrap gap-x-4 gap-y-2 overflow-x-auto pb-0.5 text-sm font-medium text-slate-600 sm:flex-wrap">
          <li>
            <a href="#section-snapshot" className="whitespace-nowrap hover:text-sky-800">
              Snapshot
            </a>
          </li>
          <li>
            <a href="#section-contact" className="whitespace-nowrap hover:text-sky-800">
              Contact
            </a>
          </li>
          <li>
            <a href="#section-outcome" className="whitespace-nowrap hover:text-sky-800">
              Outcome
            </a>
          </li>
          <li>
            <a href="#section-pipeline" className="whitespace-nowrap hover:text-sky-800">
              Pipeline
            </a>
          </li>
          {!isEmployeeLead ? (
            <li>
              <a href="#section-insurance" className="whitespace-nowrap hover:text-sky-800">
                Insurance
              </a>
            </li>
          ) : null}
          {!isEmployeeLead ? (
            <li>
              <a href="#section-referral" className="whitespace-nowrap hover:text-sky-800">
                Referral
              </a>
            </li>
          ) : null}
          {!isEmployeeLead ? (
            <li>
              <a href="#section-payer" className="whitespace-nowrap hover:text-sky-800">
                Payer
              </a>
            </li>
          ) : null}
          {!isEmployeeLead ? (
            <li>
              <a href="#section-request" className="whitespace-nowrap hover:text-sky-800">
                Request
              </a>
            </li>
          ) : null}
        </ul>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-10 lg:items-start">
        <div className="min-w-0 space-y-10">
          <LeadSnapshot
            leadId={leadId}
            displayName={displayName}
            sourceRaw={sourceRaw}
            rawStatus={rawStatus}
            contact={contactProfileDefaults}
            dobIso={dobIso}
            ownerUid={ownerUid}
            staffOptions={staffOptions}
            nextActionVal={nextActionVal}
            followUpIso={followUpIso}
            followUpAtIso={followUpAtIso}
            lastContactAt={lastContactAt}
            lastOutcome={lastOutcome}
            intakeDefaults={intakeDefaults}
            intakeRequest={intakeRequestDefaults}
            leadDisciplinesForForm={leadDisciplinesForForm}
            applicationNotes={applicationNotes}
            referralSourceLine={referralSourceLine}
            medicareNumber={medicareNumber}
            medicareEffectiveDateIso={medicareEffectiveDateIso}
            medicareNotes={medicareNotes}
            primaryInsurancePath={primaryInsurancePath}
            secondaryInsurancePath={secondaryInsurancePath}
            isEmployeeLead={isEmployeeLead}
            employmentMeta={employmentMeta}
            isConverted={isConverted}
            isDead={isDead}
            patientId={patientId}
          />

          {isEmployeeLead && hasAnyIntakeRequestDetail(intakeRequestDefaults) ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Request details</h2>
          <p className="mt-1 text-xs text-slate-500">From lead intake metadata (same shape as Facebook / Zapier).</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {intakeRequestDefaults.zip_code.trim() ? (
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-500">ZIP</dt>
                <dd className="text-sm">{intakeRequestDefaults.zip_code}</dd>
              </div>
            ) : null}
            {intakeRequestDefaults.service_needed.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Service needed</dt>
                <dd className="text-sm">{intakeRequestDefaults.service_needed}</dd>
              </div>
            ) : null}
            {intakeRequestDefaults.care_for.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Care for</dt>
                <dd className="text-sm">{intakeRequestDefaults.care_for}</dd>
              </div>
            ) : null}
            {intakeRequestDefaults.start_time.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Start time</dt>
                <dd className="text-sm">{intakeRequestDefaults.start_time}</dd>
              </div>
            ) : null}
            {intakeRequestDefaults.situation.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Situation</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{intakeRequestDefaults.situation}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {convertErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {convertErrorMessage(convertErr)}
        </div>
      ) : null}

      {isEmployeeLead ? (
        <div className="rounded-[28px] border border-indigo-200 bg-indigo-50/90 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-indigo-950">Applicant &amp; hiring</h2>
          <p className="mt-1 text-xs text-indigo-900/80">
            Submitted application details. Patient intake fields below are hidden for this record.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Applicant status</dt>
              <dd className="text-sm font-medium text-slate-900">{formatLeadPipelineStatusLabel(rawStatus)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Source / channel</dt>
              <dd className="text-sm text-slate-900">
                {formatLeadSourceLabel(sourceRaw)}
                {referralSourceLine.trim() ? (
                  <span className="block text-xs text-slate-600">{referralSourceLine.trim()}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Role applied for</dt>
              <dd className="text-sm text-slate-900">{(employmentMeta?.position ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">License #</dt>
              <dd className="text-sm text-slate-900">{(employmentMeta?.license_number ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Experience</dt>
              <dd className="text-sm text-slate-900">{(employmentMeta?.years_experience ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Preferred hours</dt>
              <dd className="text-sm text-slate-900">{(employmentMeta?.preferred_hours ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Available start</dt>
              <dd className="text-sm text-slate-900">{(employmentMeta?.available_start_date ?? "").trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Resume</dt>
              <dd className="text-sm">
                {(employmentMeta?.resume_url ?? "").trim() ? (
                  <a
                    href={(employmentMeta?.resume_url ?? "").trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                  >
                    Open resume link
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {employmentMeta?.experience_message?.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Message / experience</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white/80 p-3 text-sm text-slate-800">
                  {employmentMeta.experience_message.trim()}
                </dd>
              </div>
            ) : null}
            {applicationNotes.trim() ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800/80">Application notes (lead)</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white/80 p-3 text-xs text-slate-700">
                  {applicationNotes.trim()}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {isConverted && patientId ? (
        <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">Converted to patient</p>
          <p className="mt-1 text-emerald-900/90">
            <Link href={`/admin/crm/patients/${patientId}`} className="font-semibold text-emerald-950 underline">
              Open patient chart
            </Link>
          </p>
        </div>
      ) : null}

      {isDead ? (
        <div className="rounded-[28px] border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <p className="font-semibold">Dead lead</p>
          <p className="mt-1 text-slate-600">This record stays in CRM for reporting; intake editing is closed.</p>
        </div>
      ) : null}

      <LeadSectionCard
        id="section-contact"
        title="Lead contact"
        description="CRM contact linked to this lead (same record if converted to a patient). Updates name, phones, email, date of birth, address, and notes everywhere this contact appears."
      >
        <form action={updateLeadContactProfile} id="form-lead-contact" className="space-y-0">
          <input type="hidden" name="leadId" value={leadId} />
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Full name <span className="text-red-600">*</span>
            <input
              name="contact_full_name"
              required
              autoComplete="name"
              className={inp}
              defaultValue={contactProfileDefaults.fullName}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Primary phone <span className="text-red-600">*</span>
            <FormattedPhoneInput
              name="primary_phone"
              required
              className={inp}
              defaultValue={contactProfileDefaults.primaryPhone}
              autoComplete="tel"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Caregiver / alternate phone
            <FormattedPhoneInput
              name="secondary_phone"
              className={inp}
              defaultValue={contactProfileDefaults.secondaryPhone}
              autoComplete="tel"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Email
            <input name="email" type="email" autoComplete="email" className={inp} defaultValue={contactProfileDefaults.email} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Date of birth
            <input name="dob" type="date" className={inp} defaultValue={dobIso ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Address line 1
            <input
              name="address_line_1"
              autoComplete="address-line1"
              className={inp}
              defaultValue={contactProfileDefaults.address_line_1}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Address line 2
            <input
              name="address_line_2"
              autoComplete="address-line2"
              className={inp}
              defaultValue={contactProfileDefaults.address_line_2}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            City
            <input name="city" autoComplete="address-level2" className={inp} defaultValue={contactProfileDefaults.city} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            State
            <input name="state" autoComplete="address-level1" className={inp} defaultValue={contactProfileDefaults.state} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            ZIP
            <input name="zip" autoComplete="postal-code" className={inp} defaultValue={contactProfileDefaults.zip} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Notes
            <textarea
              name="contact_notes"
              rows={3}
              className={inp}
              defaultValue={contactProfileDefaults.notes}
              placeholder="Internal notes about this person (not lead intake — use sections below for referral/payer)."
            />
          </label>
        </div>
        <div className="mt-6">
          <button
            type="submit"
            className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            Save contact
          </button>
        </div>
      </form>

        <div className="mt-8 border-t border-slate-200/80 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Communication</h3>
          <p className="mt-1 text-xs text-slate-500">
            Opens the staff phone workspace (Twilio keypad and SMS inbox). Requires phone workspace access on your
            account.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {keypadHref ? (
              <Link
                href={keypadHref}
                prefetch={false}
                className="inline-flex rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                Call lead
              </Link>
            ) : (
              <span className="text-xs text-slate-400">No dialable phone on file</span>
            )}
            {smsHref ? (
              <Link
                href={smsHref}
                prefetch={false}
                className="inline-flex rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
              >
                Text lead
              </Link>
            ) : (
              <span className="text-xs text-slate-400">Add a valid primary phone to text</span>
            )}
          </div>
        </div>
      </LeadSectionCard>

      {!terminal ? (
        <LeadSectionCard
          id="section-outcome"
          title="Contact outcome"
          description={
            <>
              Log each attempt. <strong>No answer</strong> sets follow-up to tomorrow; <strong>Left voicemail</strong>{" "}
              suggests two days out (edit before save if you prefer).
            </>
          }
          className="border-amber-200/80 bg-amber-50/20 ring-amber-100/50"
        >
          <div className="mt-0">
            <LeadContactOutcomeForm
              key={leadId}
              leadId={leadId}
              savedLastOutcome={lastOutcome}
              defaultNextAction={nextActionVal}
              defaultFollowUpIso={followUpIso}
              defaultFollowUpAtIso={followUpAtIso}
              tomorrowIso={tomorrowIso}
              voicemailSuggestedIso={voicemailSuggestedIso}
              inputCls={inp}
            />
          </div>
        </LeadSectionCard>
      ) : null}

      {!terminal ? (
        <form action={updateLeadIntake} id="form-lead-intake" className="space-y-10">
          <input type="hidden" name="leadId" value={leadId} />
          {isEmployeeLead ? (
            <>
              <input type="hidden" name="referring_doctor_name" value={intakeDefaults.referring_doctor_name} />
              <input type="hidden" name="doctor_office_name" value={intakeDefaults.doctor_office_name} />
              <input type="hidden" name="doctor_office_phone" value={intakeDefaults.doctor_office_phone} />
              <input type="hidden" name="doctor_office_fax" value={intakeDefaults.doctor_office_fax} />
              <input type="hidden" name="doctor_office_contact_person" value={intakeDefaults.doctor_office_contact_person} />
              <input type="hidden" name="referring_provider_name" value={intakeDefaults.referring_provider_name} />
              <input type="hidden" name="referring_provider_phone" value={intakeDefaults.referring_provider_phone} />
              <input type="hidden" name="payer_name" value={intakeDefaults.payer_name} />
              <input type="hidden" name="payer_type" value={intakeDefaults.payer_type} />
              <input type="hidden" name="referral_source" value={intakeDefaults.referral_source} />
              <input type="hidden" name="intake_status" value={intakeDefaults.intake_status} />
              <input type="hidden" name="intake_zip_code" value={intakeRequestDefaults.zip_code} />
              <input type="hidden" name="intake_service_needed" value={intakeRequestDefaults.service_needed} />
              <input type="hidden" name="intake_care_for" value={intakeRequestDefaults.care_for} />
              <input type="hidden" name="intake_start_time" value={intakeRequestDefaults.start_time} />
              <input type="hidden" name="intake_situation" value={intakeRequestDefaults.situation} />
              <input type="hidden" name="lead_notes" value={applicationNotes} />
              {leadDisciplinesForForm.map((d) => (
                <input key={d} type="hidden" name="service_disciplines" value={d} />
              ))}
            </>
          ) : null}

          <LeadSectionCard
            id="section-pipeline"
            title="Pipeline & ownership"
            description="Status, owner, and next touch. Use disposition when the referral is won or lost."
            className="border-indigo-100/90 bg-indigo-50/20 ring-indigo-100/40"
          >
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Pipeline status
                <select name="pipeline_status" className={inp} defaultValue={pipelineDefault}>
                  {LEAD_PIPELINE_STATUS_EDITABLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {rawStatus &&
                  !LEAD_PIPELINE_STATUS_EDITABLE_OPTIONS.some((o) => o.value === rawStatus) &&
                  !isLeadPipelineTerminal(rawStatus) ? (
                    <option value={rawStatus}>
                      {formatLeadPipelineStatusLabel(rawStatus)} (current)
                    </option>
                  ) : null}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Owner
                <select name="owner_user_id" className={inp} defaultValue={ownerUid}>
                  <option value="">— Unassigned —</option>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {staffOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Next action
                <select name="next_action" className={inp} defaultValue={nextActionVal}>
                  <option value="">—</option>
                  {LEAD_NEXT_ACTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Follow-up date
                <input type="date" name="follow_up_date" className={inp} defaultValue={followUpIso} />
              </label>
            </div>
            <div className="mt-8 border-t border-slate-200/80 pt-6">
              <h3 className="text-sm font-semibold text-slate-900">Disposition</h3>
              <p className="mt-1 text-xs text-slate-500">Convert to a patient chart or mark the lead dead.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {isEmployeeLead ? (
                  <p className="max-w-xl text-xs text-slate-600">
                    Hiring applicants are not converted to patients from this screen. Use{" "}
                    <strong>Mark dead lead</strong> if the applicant is disqualified, or continue follow-up via contact
                    outcomes above.
                  </p>
                ) : !patientId ? (
                  <form action={convertLeadToPatientFromLeadDetail}>
                    <input type="hidden" name="leadId" value={leadId} />
                    <button
                      type="submit"
                      className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                    >
                      Convert to patient
                    </button>
                  </form>
                ) : (
                  <Link
                    href={`/admin/crm/patients/${patientId}`}
                    className="inline-flex rounded-lg border border-sky-600 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    Open existing patient
                  </Link>
                )}
                <form action={markLeadDead}>
                  <input type="hidden" name="leadId" value={leadId} />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-400 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Mark dead lead
                  </button>
                </form>
              </div>
            </div>
          </LeadSectionCard>

          {!isEmployeeLead ? (
            <LeadSectionCard
              id="section-insurance"
              title="Insurance information"
              description="Upload primary and secondary insurance card images or PDFs. Add typed Medicare details when you have them — uploads stay the source of truth for card images."
            >
              <LeadInsuranceSection
                leadId={leadId}
                primaryPath={primaryInsurancePath}
                secondaryPath={secondaryInsurancePath}
                primaryViewUrl={primaryInsuranceViewUrl}
                secondaryViewUrl={secondaryInsuranceViewUrl}
              />
              <div className="mt-8 border-t border-slate-200/80 pt-8">
                <LeadMedicareFields
                  defaultNumber={medicareNumber}
                  defaultEffectiveDate={medicareEffectiveDateIso}
                  defaultNotes={medicareNotes}
                />
              </div>
            </LeadSectionCard>
          ) : null}

          {!isEmployeeLead ? (
          <LeadSectionCard
            id="section-referral"
            title="Referral & doctor office"
            description="Referring physician, facility, and contact details for this lead."
          >
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Referring doctor name
                <input name="referring_doctor_name" className={inp} defaultValue={intakeDefaults.referring_doctor_name} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office name
                <input name="doctor_office_name" className={inp} defaultValue={intakeDefaults.doctor_office_name} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office phone
                <FormattedPhoneInput
                  name="doctor_office_phone"
                  className={inp}
                  defaultValue={intakeDefaults.doctor_office_phone}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Doctor office fax
                <FormattedPhoneInput
                  name="doctor_office_fax"
                  className={inp}
                  defaultValue={intakeDefaults.doctor_office_fax}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Office contact person
                <input
                  name="doctor_office_contact_person"
                  className={inp}
                  defaultValue={intakeDefaults.doctor_office_contact_person}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Referring provider / agency name
                <input name="referring_provider_name" className={inp} defaultValue={intakeDefaults.referring_provider_name} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Referring provider phone
                <FormattedPhoneInput
                  name="referring_provider_phone"
                  className={inp}
                  defaultValue={intakeDefaults.referring_provider_phone}
                />
              </label>
            </div>
          </LeadSectionCard>
          ) : null}

          {!isEmployeeLead ? (
          <LeadSectionCard
            id="section-payer"
            title="Payer & services"
            description="Coverage, disciplines, and intake status for scheduling."
          >
            <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Payer
                <SearchablePayerSelect
                  defaultValue={intakeDefaults.payer_name}
                  className={inp}
                  id="lead-workspace-existing-payer"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Payer type (category)
                <PayerTypeSelect
                  name="payer_type"
                  className={inp}
                  defaultValue={intakeDefaults.payer_type}
                  id="lead-workspace-existing-payer-type"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Referral source
                <input name="referral_source" className={inp} defaultValue={intakeDefaults.referral_source} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Service disciplines
                <ServiceDisciplineCheckboxes defaultSelected={leadDisciplinesForForm} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Intake status
                <input name="intake_status" className={inp} defaultValue={intakeDefaults.intake_status} />
              </label>
            </div>
          </LeadSectionCard>
          ) : null}

          {!isEmployeeLead ? (
            <LeadSectionCard
              id="section-request"
              title="Request details"
              description="Same fields as Facebook / Zapier intake (stored in external_source_metadata.intake_request)."
            >
              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                  ZIP code
                  <input
                    name="intake_zip_code"
                    autoComplete="postal-code"
                    className={inp}
                    defaultValue={intakeRequestDefaults.zip_code}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Service needed
                  <input name="intake_service_needed" className={inp} defaultValue={intakeRequestDefaults.service_needed} />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Care for
                  <input name="intake_care_for" className={inp} defaultValue={intakeRequestDefaults.care_for} />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Start time / timing
                  <input name="intake_start_time" className={inp} defaultValue={intakeRequestDefaults.start_time} />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Situation
                  <textarea
                    name="intake_situation"
                    rows={3}
                    className={inp}
                    defaultValue={intakeRequestDefaults.situation}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                  Lead notes (general)
                  <textarea
                    name="lead_notes"
                    rows={3}
                    className={inp}
                    defaultValue={applicationNotes}
                    placeholder="Optional notes on this lead (separate from intake status)."
                  />
                </label>
              </div>
            </LeadSectionCard>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Save intake
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Intake snapshot</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Doctor</dt>
              <dd>{intakeDefaults.referring_doctor_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Office</dt>
              <dd>{intakeDefaults.doctor_office_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Payer</dt>
              <dd>{intakeDefaults.payer_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Next action</dt>
              <dd>{nextActionVal || "—"}</dd>
            </div>
            {hasAnyIntakeRequestDetail(intakeRequestDefaults) ? (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">Request details</dt>
                <dd className="mt-1 space-y-1 text-sm text-slate-800">
                  {intakeRequestDefaults.zip_code.trim() ? (
                    <p>
                      <span className="font-medium text-slate-600">ZIP: </span>
                      {intakeRequestDefaults.zip_code}
                    </p>
                  ) : null}
                  {intakeRequestDefaults.service_needed.trim() ? (
                    <p>
                      <span className="font-medium text-slate-600">Service needed: </span>
                      {intakeRequestDefaults.service_needed}
                    </p>
                  ) : null}
                  {intakeRequestDefaults.care_for.trim() ? (
                    <p>
                      <span className="font-medium text-slate-600">Care for: </span>
                      {intakeRequestDefaults.care_for}
                    </p>
                  ) : null}
                  {intakeRequestDefaults.start_time.trim() ? (
                    <p>
                      <span className="font-medium text-slate-600">Start time: </span>
                      {intakeRequestDefaults.start_time}
                    </p>
                  ) : null}
                  {intakeRequestDefaults.situation.trim() ? (
                    <p className="whitespace-pre-wrap">
                      <span className="font-medium text-slate-600">Situation: </span>
                      {intakeRequestDefaults.situation}
                    </p>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
        <div className="border-t border-slate-200 pt-6">
          <Link
            href="/admin/crm/leads"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
            Back to leads
          </Link>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:flex lg:justify-end">
          <button
            type="submit"
            form="form-lead-contact"
            className="pointer-events-auto rounded-lg border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
          >
            Save contact
          </button>
          {!terminal ? (
            <button
              type="submit"
              form="form-lead-intake"
              className="pointer-events-auto rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Save intake
            </button>
          ) : null}
        </div>
      </div>

      <aside className="mt-8 flex min-h-0 min-w-0 flex-col pb-32 lg:sticky lg:top-28 lg:mt-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-hidden lg:self-start">
        <LeadFollowUpContextPanel
          leadId={leadId}
          activities={initialActivities}
          staffOptions={staffOptions}
          lastNote={lastNote}
          leadCreatedAt={leadCreatedAt}
          applicationNotes={applicationNotes}
          followUpIso={followUpIso}
          followUpAtIso={followUpAtIso}
          nextActionVal={nextActionVal}
        />
      </aside>
    </div>
    </div>
  );
}
