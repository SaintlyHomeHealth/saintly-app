import Link from "next/link";
import { redirect } from "next/navigation";

import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { PayerTypeSelect } from "@/components/crm/PayerTypeSelect";
import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";

import { createPatientManualFromCrm } from "../../actions";
import { PatientIntakeSearchPanel } from "./_components/PatientIntakeSearchPanel";
import { supabaseAdmin } from "@/lib/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

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
  searchParams: Promise<{ manualError?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const params = await searchParams;
  const manualErr = typeof params.manualError === "string" ? params.manualError.trim() : "";

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
      <AdminPageHeader
        eyebrow="Patients"
        title="Add patient"
        description={
          <>
            Search an existing lead or intake record and convert in one click — or create a contact and patient
            manually below.
            {manualErr ? (
              <span className="mt-2 block text-sm text-red-700">{manualErrorMessage(manualErr)}</span>
            ) : null}
          </>
        }
      />

      <PatientIntakeSearchPanel />

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create patient manually</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use when no matching lead exists. Creates a contact and patient record. Optional primary nurse uses the same
          assignment flow as the patients list.
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
            Caregiver / alternate phone
            <FormattedPhoneInput name="secondary_phone" className={inp} autoComplete="tel" />
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
