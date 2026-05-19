"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import {
  checkSalesAgentLeadDuplicates,
  createSalesAgentLead,
} from "@/app/sales-agent/actions";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";
import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { FormattedDobInput } from "@/components/sales-agent/FormattedDobInput";
import type { SalesAgentDuplicateHit } from "@/lib/sales-agent/sales-agent-lead-duplicate-check";
import {
  DEFAULT_SALES_AGENT_PATHS,
  type SalesAgentPaths,
} from "@/lib/sales-agent/sales-agent-workspace-paths";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";

const INSURANCE_TYPES = [
  "Medicare",
  "Medicare Advantage",
  "AHCCCS",
  "Commercial",
  "Other",
] as const;

function errorMessage(code: string | null): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    validation_name: "Patient name is required.",
    validation_address: "Address is required.",
    validation_phone: "A valid phone number is required.",
    validation_dob: "Date of birth is required (MM/DD/YYYY).",
    validation_insurance: "Insurance type or insurance name is required.",
    validation_consent: "Consent to contact is required.",
    duplicate_found: "Possible existing lead found. Review below and submit anyway, or contact admin.",
    contact_failed: "Could not save patient contact. Try again.",
    lead_failed: "Could not create the lead. Try again.",
  };
  return m[code] ?? "Something went wrong. Try again.";
}

function CardPhotoInput({
  name,
  label,
  capture,
}: {
  name: string;
  label: string;
  capture?: "environment" | "user";
}) {
  return (
    <label className="flex flex-col text-xs font-medium text-slate-600">
      {label}
      <input
        name={name}
        type="file"
        accept="image/*"
        capture={capture}
        className="mt-1 text-sm file:mr-2 file:rounded-full file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-sky-800"
      />
    </label>
  );
}

type Props = {
  paths?: SalesAgentPaths;
};

export function SalesAgentCreateLeadForm({ paths = DEFAULT_SALES_AGENT_PATHS }: Props) {
  const searchParams = useSearchParams();
  const err = errorMessage(searchParams.get("error"));
  const [duplicates, setDuplicates] = useState<SalesAgentDuplicateHit[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();

  const runDuplicateCheck = useCallback(async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const hits = await checkSalesAgentLeadDuplicates(fd);
    setDuplicates(hits);
    return hits;
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    startTransition(async () => {
      if (!confirmDuplicate) {
        const hits = await runDuplicateCheck(form);
        if (hits.length > 0) {
          setConfirmDuplicate(false);
          return;
        }
      } else {
        fd.set("confirm_duplicate", "1");
      }
      await createSalesAgentLead(fd);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={paths.leads} className="text-sm font-medium text-sky-700 hover:underline">
          ← Back to dashboard
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">Create Order / Lead</h2>
        <p className="mt-1 text-sm text-slate-600">
          Submit a new patient referral. Our intake team will follow up and convert eligible leads to patients.
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{err}</div>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Possible existing lead found</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {duplicates.map((d) => (
              <li key={d.leadId}>
                {d.patientName} — matched by {d.matchedBy.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-2">Submit anyway or contact admin if this is the same patient.</p>
          <label className="mt-3 flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={confirmDuplicate}
              onChange={(e) => setConfirmDuplicate(e.target.checked)}
              className="rounded border-amber-400 text-sky-600"
            />
            <span>I understand — submit anyway</span>
          </label>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Patient info</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
              Patient name *
              <input name="patient_name" required className={inp} autoComplete="name" />
            </label>
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
              Address *
              <input name="address" required className={inp} autoComplete="street-address" />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Phone number *
              <FormattedPhoneInput name="phone_number" required className={inp} />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Email
              <input name="email" type="email" className={inp} autoComplete="email" />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Date of birth *
              <FormattedDobInput name="date_of_birth" required className={inp} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Caregiver info</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Caregiver name
              <input name="caregiver_name" className={inp} />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Caregiver phone
              <FormattedPhoneInput name="caregiver_phone_number" className={inp} />
            </label>
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600">
              Relationship to patient
              <input name="caregiver_relationship" className={inp} placeholder="Spouse, daughter, etc." />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Insurance info</h3>
          <p className="mt-1 text-xs text-slate-500">Provide insurance type or plan name (at least one required).</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Medicare number
              <input name="medicare_number" className={inp} autoComplete="off" inputMode="text" />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Insurance type
              <select name="insurance_type" className={inp} defaultValue="">
                <option value="">— Select —</option>
                {INSURANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Insurance name / plan
              <input name="insurance_name" className={inp} />
            </label>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Member ID
              <input name="insurance_member_id" className={inp} />
            </label>
            <CardPhotoInput name="medicare_card_front" label="Medicare card (front)" capture="environment" />
            <CardPhotoInput name="medicare_card_back" label="Medicare card (back)" capture="environment" />
            <CardPhotoInput name="insurance_card_front" label="Insurance card (front)" capture="environment" />
            <CardPhotoInput name="insurance_card_back" label="Insurance card (back)" capture="environment" />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Referral / clinical info</h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-600">Services requested</p>
              <ServiceDisciplineCheckboxes name="services_requested" className="mt-2 flex flex-wrap gap-3" />
            </div>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Reason for referral
              <textarea name="reason_for_referral" rows={2} className={inp} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Doctor / PCP name
                <input name="doctor_or_pcp_name" className={inp} />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600">
                Facility / hospital name
                <input name="facility_or_hospital_name" className={inp} />
              </label>
            </div>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Notes
              <textarea name="notes" rows={3} className={inp} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
            <input
              type="checkbox"
              name="consent_to_contact"
              required
              className="mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>
              Patient/caregiver gave permission for Saintly Home Health to contact them regarding home health
              services. *
            </span>
          </label>
        </section>

        {confirmDuplicate ? <input type="hidden" name="confirm_duplicate" value="1" /> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending || (duplicates.length > 0 && !confirmDuplicate)}
            className="rounded-full bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit order / lead"}
          </button>
          <Link
            href={paths.leads}
            className="rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

/** @deprecated Use SalesAgentCreateLeadForm */
export const SalesAgentNewLeadForm = SalesAgentCreateLeadForm;
