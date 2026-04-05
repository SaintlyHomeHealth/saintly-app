import Link from "next/link";

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

import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import { LeadContactOutcomeForm } from "@/app/admin/crm/leads/_components/LeadContactOutcomeForm";
import {
  convertLeadToPatientFromLeadDetail,
  createLeadManualFromCrm,
  markLeadDead,
  updateLeadContactProfile,
  updateLeadIntake,
} from "../actions";
import { addCalendarDaysToIsoDate, getCrmCalendarTodayIso, getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
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
  leadDisciplinesForForm: string[];
  intakeDefaults: LeadWorkspaceIntakeDefaults;
  contactProfileDefaults: LeadWorkspaceContactProfileDefaults;
  staffOptions: LeadWorkspaceStaffOption[];
  lastContactAt: string | null;
  lastOutcome: string | null;
  lastNote: string | null;
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
    leadDisciplinesForForm,
    intakeDefaults,
    contactProfileDefaults,
    staffOptions,
    lastContactAt,
    lastOutcome,
    lastNote,
  } = props;

  const lastContactLine = formatLeadLastContactSummary(lastContactAt, lastOutcome);
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
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {formatLeadSourceLabel(sourceRaw)} · Pipeline:{" "}
          <span className="font-medium text-slate-800">{formatLeadPipelineStatusLabel(rawStatus)}</span>
          {" · "}
          <Link href="/admin/crm/leads" className="font-semibold text-sky-800 hover:underline">
            Back to leads
          </Link>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <LeadDeleteButton leadId={leadId} variant="detail" />
          </span>
        </p>
        {primaryPhone ? (
          <p className="mt-1 text-xs text-slate-600 tabular-nums">{formatPhoneNumber(primaryPhone)}</p>
        ) : null}
        {contactProfileDefaults.secondaryPhone ? (
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            Caregiver / alternate: {formatPhoneNumber(contactProfileDefaults.secondaryPhone)}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-600">
          Last contact:{" "}
          <span className="font-medium text-slate-900">{lastContactLine}</span>
        </p>
      </div>

      {convertErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {convertErrorMessage(convertErr)}
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

      <form action={updateLeadContactProfile} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Lead contact</h2>
        <p className="mt-1 text-xs text-slate-500">
          CRM contact linked to this lead (same record if converted to a patient). Updates name, phone, and address
          everywhere that contact is shown.
        </p>
        <input type="hidden" name="leadId" value={leadId} />
        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
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
        <div className="mt-4">
          <button
            type="submit"
            className="rounded border border-sky-600 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
          >
            Save contact
          </button>
        </div>
      </form>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Communication</h2>
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

      {!terminal ? (
        <div className="rounded-[28px] border border-amber-100 bg-amber-50/25 p-5 shadow-sm ring-1 ring-amber-100/60">
          <h2 className="text-sm font-semibold text-slate-900">Contact Outcome</h2>
          <p className="mt-1 text-xs text-slate-600">
            Log each attempt. <strong>No answer</strong> sets follow-up to tomorrow; <strong>Left voicemail</strong>{" "}
            suggests two days out (edit before save if you prefer).
          </p>
          <div className="mt-4">
            <LeadContactOutcomeForm
              key={`${lastContactAt ?? ""}|${lastOutcome ?? ""}|${followUpIso}|${nextActionVal}`}
              leadId={leadId}
              defaultNextAction={nextActionVal}
              defaultFollowUpIso={followUpIso}
              defaultNotes={lastNote ?? ""}
              tomorrowIso={tomorrowIso}
              voicemailSuggestedIso={voicemailSuggestedIso}
              inputCls={inp}
            />
          </div>
        </div>
      ) : null}

      {!terminal ? (
        <div className="rounded-[28px] border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm ring-1 ring-indigo-100/60">
          <h2 className="text-sm font-semibold text-slate-900">Outcome</h2>
          <p className="mt-1 text-xs text-slate-600">Close the loop when the referral is won or lost.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!patientId ? (
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
      ) : null}

      {!terminal ? (
        <form action={updateLeadIntake} className="space-y-6">
          <input type="hidden" name="leadId" value={leadId} />

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Pipeline &amp; ownership</h2>
            <p className="mt-1 text-xs text-slate-500">Status, owner, and next touch.</p>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
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
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Referral &amp; doctor office</h2>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
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
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Payer &amp; services</h2>
            <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
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
          </div>

          <div>
            <button
              type="submit"
              className="rounded border border-sky-600 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Save changes
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
          </dl>
        </div>
      )}
    </div>
  );
}
