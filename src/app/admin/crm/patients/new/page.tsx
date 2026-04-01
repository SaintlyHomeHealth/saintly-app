import Link from "next/link";
import { redirect } from "next/navigation";

import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { PayerTypeSelect } from "@/components/crm/PayerTypeSelect";
import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";

import { convertLeadToPatientFromCrm, createPatientManualFromCrm } from "../../actions";
import { supabaseAdmin } from "@/lib/admin";
import { isLeadPipelineTerminal } from "@/lib/crm/lead-pipeline-status";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function contactDisplayName(c: ContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function normalizeContact(raw: ContactEmb | ContactEmb[] | null | undefined): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function errorMessage(code: string): string {
  switch (code) {
    case "missing":
      return "Missing lead. Try again.";
    case "already_converted":
      return "This lead is already converted.";
    case "lead_dead":
      return "This lead is marked dead and cannot be converted.";
    case "patient_exists":
      return "A patient already exists for this contact.";
    case "forbidden":
      return "Not allowed.";
    case "invalid":
    case "lead_not_found":
    case "load_failed":
      return "Could not load that lead.";
    case "insert_failed":
      return "Could not create the patient record.";
    case "update_failed":
      return "Patient was created but the lead status could not be updated.";
    default:
      return "Something went wrong.";
  }
}

function manualErrorMessage(code: string): string {
  switch (code) {
    case "forbidden":
      return "You do not have permission to create a patient.";
    case "validation_name":
      return "First name and last name are required.";
    case "validation_phone":
      return "Primary phone is required.";
    case "contact_insert_failed":
      return "Could not save the contact. Check required fields and try again.";
    case "patient_insert_failed":
      return "Could not create the patient record.";
    default:
      return "Something went wrong.";
  }
}

function staffPrimaryLabel(s: {
  user_id: string;
  email: string | null;
  full_name: string | null;
}): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    if (local) {
      const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return `${s.user_id.slice(0, 8)}…`;
}

const inp =
  "mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";
const selectCls =
  "max-w-md rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800";

export default async function AdminCrmPatientNewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; manualError?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const params = await searchParams;
  const errCode = typeof params.error === "string" ? params.error.trim() : "";
  const manualErr = typeof params.manualError === "string" ? params.manualError.trim() : "";

  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id, contact_id, source, status, created_at, contacts ( full_name, first_name, last_name )")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = (rows ?? []) as {
    id: string;
    contact_id: string;
    source: string;
    status: string | null;
    created_at: string;
    contacts: ContactEmb | ContactEmb[] | null;
  }[];

  const convertible = list.filter((r) => !isLeadPipelineTerminal(r.status));

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as {
    user_id: string;
    email: string | null;
    role: string;
    full_name: string | null;
  }[];

  return (
    <div className="space-y-8 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/contacts" className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/dispatch" className="underline-offset-2 hover:underline">
          Dispatch
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/roster" className="underline-offset-2 hover:underline">
          Roster
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add patient</h1>
        <p className="mt-1 text-sm text-slate-600">
          Convert an existing CRM lead, or create a contact and patient manually (with optional primary nurse assignment).
        </p>
        {error ? <p className="mt-2 text-sm text-red-700">{error.message}</p> : null}
        {errCode ? <p className="mt-2 text-sm text-red-700">{errorMessage(errCode)}</p> : null}
        {manualErr ? <p className="mt-2 text-sm text-red-700">{manualErrorMessage(manualErr)}</p> : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Convert from CRM lead</h2>
        <p className="text-sm text-slate-600">
          Complete referral &amp; payer intake on the lead if needed, then convert below.
        </p>
        <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3">Intake</th>
                <th className="whitespace-nowrap px-4 py-3">Convert</th>
              </tr>
            </thead>
            <tbody>
              {convertible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-slate-500">
                    No open leads to convert.{" "}
                    <Link href="/admin/crm/leads" className="font-semibold text-sky-800 hover:underline">
                      View all leads
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                convertible.map((r) => {
                  const contact = normalizeContact(r.contacts);
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-800">{contactDisplayName(contact ?? null)}</td>
                      <td className="px-4 py-3 text-slate-600">{r.source}</td>
                      <td className="px-4 py-3 text-slate-600">{r.status ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/crm/leads/${r.id}`}
                          className="font-semibold text-sky-800 hover:underline"
                        >
                          Open intake
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <form action={convertLeadToPatientFromCrm} className="inline">
                          <input type="hidden" name="leadId" value={r.id} />
                          <button
                            type="submit"
                            className="rounded border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                          >
                            Convert to patient
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create patient manually</h2>
        <p className="mt-1 text-sm text-slate-600">
          Creates a CRM contact and patient record. Optional primary nurse uses the same assignment flow as the patients
          list.
        </p>
        <form action={createPatientManualFromCrm} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
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
            Email
            <input name="email" type="email" autoComplete="email" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Street address
            <input name="addressLine1" autoComplete="address-line1" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Address line 2
            <input name="addressLine2" autoComplete="address-line2" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            City
            <input name="city" autoComplete="address-level2" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            State
            <input name="state" autoComplete="address-level1" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            ZIP
            <input name="zip" autoComplete="postal-code" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Payer
            <SearchablePayerSelect name="payerName" className={inp} id="manual-payer" />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Payer type (category)
            <PayerTypeSelect name="payerType" className={inp} id="manual-payer-type" />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Service disciplines
            <ServiceDisciplineCheckboxes />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Start of care
            <input name="startOfCare" type="date" className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Patient status
            <select name="patientStatus" className={selectCls} defaultValue="pending">
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discharged">Discharged</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Primary nurse (optional)
            <select name="assignedUserId" className={selectCls} defaultValue="">
              <option value="">—</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {`${staffPrimaryLabel(s)} (${s.role}) · ${s.email?.trim() || s.user_id.slice(0, 8) + "…"}`}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded border border-sky-600 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Create patient
            </button>
          </div>
        </form>
      </section>

      <p className="text-sm text-slate-600">
        <Link href="/admin/crm/patients" className="font-semibold text-sky-800 hover:underline">
          Back to patients
        </Link>
      </p>
    </div>
  );
}
