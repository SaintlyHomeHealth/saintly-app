"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { EmploymentClassification } from "@/lib/employee-contracts";
import {
  EmployeeTaxFormRow,
  EmployeeTaxFormType,
  W4FormData,
  W9FormData,
  getTaxFormLabel,
  getTaxFormTypeForClassification,
  normalizeTaxFormData,
} from "@/lib/employee-tax-forms";

type Props = {
  applicantId: string;
  sectionId?: string;
};

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
      />
    </div>
  );
}

export default function EmployeeTaxFormCard({ applicantId, sectionId }: Props) {
  const [taxForm, setTaxForm] = useState<EmployeeTaxFormRow | null>(null);
  const [formType, setFormType] = useState<EmployeeTaxFormType | null>(null);
  const [formData, setFormData] = useState<W4FormData | W9FormData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!applicantId) return;

    const loadTaxForm = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data: contractData, error: contractError } = await supabase
        .from("employee_contracts")
        .select("employment_classification")
        .eq("applicant_id", applicantId)
        .eq("is_current", true)
        .maybeSingle<{ employment_classification: EmploymentClassification }>();

      if (contractError) {
        setErrorMessage("We could not load your tax form right now.");
        setIsLoading(false);
        return;
      }

      const applicableFormType = getTaxFormTypeForClassification(
        contractData?.employment_classification || null
      );

      if (!applicableFormType) {
        setFormType(null);
        setFormData(null);
        setTaxForm(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("employee_tax_forms")
        .select("*")
        .eq("applicant_id", applicantId)
        .eq("form_type", applicableFormType)
        .eq("is_current", true)
        .eq("form_status", "sent")
        .maybeSingle<EmployeeTaxFormRow>();

      setIsLoading(false);

      if (error) {
        setErrorMessage("We could not load your tax form right now.");
        return;
      }

      if (!data) {
        setFormType(applicableFormType);
        setFormData(null);
        setTaxForm(null);
        return;
      }

      setFormType(applicableFormType);
      setTaxForm(data);
      setFormData(normalizeTaxFormData(applicableFormType, data.form_data) as W4FormData | W9FormData);
    };

    void loadTaxForm();
  }, [applicantId]);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => (prev ? ({ ...prev, [field]: value } as W4FormData | W9FormData) : prev));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSave = async () => {
    if (!taxForm || !formType || !formData) return;

    const requiredError =
      formType === "w4"
        ? validateW4(formData as W4FormData)
        : validateW9(formData as W9FormData);

    if (requiredError) {
      setErrorMessage(requiredError);
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const signedDate = formData.signed_date;
    const payload = {
      form_data: formData,
      form_status: "completed" as const,
      employee_signed_name: formData.signature_name.trim(),
      employee_signed_at: new Date(`${signedDate}T12:00:00Z`).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("employee_tax_forms")
      .update(payload)
      .eq("id", taxForm.id)
      .eq("is_current", true)
      .eq("form_status", "sent")
      .select("*")
      .maybeSingle<EmployeeTaxFormRow>();

    setIsSaving(false);

    if (error) {
      setErrorMessage("We could not save your tax form right now. Please try again.");
      return;
    }

    setTaxForm(null);
    setFormData(null);
    setSuccessMessage(`${getTaxFormLabel(formType)} saved.`);
  };

  if (isLoading || !taxForm || taxForm.form_status !== "sent" || !formType || !formData) {
    return null;
  }

  const formLabel = getTaxFormLabel(formType);

  return (
    <div id={sectionId} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Portal Tax Form
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Complete your {formLabel}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Saintly Home Health sent this tax form to your portal for on-site completion.
          </p>
        </div>

        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
        >
          Awaiting Completion
        </span>
      </div>

      <div className="mt-6 space-y-5 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
        {formType === "w4" ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <TextField
                label="First Name"
                value={(formData as W4FormData).first_name}
                onChange={(value) => updateField("first_name", value)}
              />
              <TextField
                label="Middle Initial"
                value={(formData as W4FormData).middle_initial}
                onChange={(value) => updateField("middle_initial", value)}
              />
              <TextField
                label="Last Name"
                value={(formData as W4FormData).last_name}
                onChange={(value) => updateField("last_name", value)}
              />
            </div>
            <TextField
              label="Address"
              value={(formData as W4FormData).address}
              onChange={(value) => updateField("address", value)}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <TextField
                label="City"
                value={(formData as W4FormData).city}
                onChange={(value) => updateField("city", value)}
              />
              <TextField
                label="State"
                value={(formData as W4FormData).state}
                onChange={(value) => updateField("state", value)}
              />
              <TextField
                label="ZIP"
                value={(formData as W4FormData).zip}
                onChange={(value) => updateField("zip", value)}
              />
            </div>
            <TextField
              label="SSN"
              value={(formData as W4FormData).ssn}
              onChange={(value) => updateField("ssn", value)}
            />
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Filing Status
              </label>
              <select
                value={(formData as W4FormData).filing_status}
                onChange={(event) => updateField("filing_status", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Select filing status</option>
                <option value="single">Single or Married filing separately</option>
                <option value="married_filing_jointly">Married filing jointly</option>
                <option value="head_of_household">Head of household</option>
              </select>
            </div>
            <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
              <input
                type="checkbox"
                checked={(formData as W4FormData).multiple_jobs}
                onChange={(event) => updateField("multiple_jobs", event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
              />
              <span className="text-sm leading-6 text-slate-700">
                Check this box if there are multiple jobs or your spouse works.
              </span>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Dependents Amount"
                value={(formData as W4FormData).dependents_amount}
                onChange={(value) => updateField("dependents_amount", value)}
              />
              <TextField
                label="Other Income"
                value={(formData as W4FormData).other_income}
                onChange={(value) => updateField("other_income", value)}
              />
              <TextField
                label="Deductions"
                value={(formData as W4FormData).deductions}
                onChange={(value) => updateField("deductions", value)}
              />
              <TextField
                label="Extra Withholding"
                value={(formData as W4FormData).extra_withholding}
                onChange={(value) => updateField("extra_withholding", value)}
              />
            </div>
          </>
        ) : (
          <>
            <TextField
              label="Full Name"
              value={(formData as W9FormData).full_name}
              onChange={(value) => updateField("full_name", value)}
            />
            <TextField
              label="Business Name (Optional)"
              value={(formData as W9FormData).business_name}
              onChange={(value) => updateField("business_name", value)}
            />
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Federal Tax Classification
              </label>
              <select
                value={(formData as W9FormData).federal_tax_classification}
                onChange={(event) =>
                  updateField("federal_tax_classification", event.target.value)
                }
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Select classification</option>
                <option value="individual_sole_proprietor">Individual / sole proprietor</option>
                <option value="c_corporation">C corporation</option>
                <option value="s_corporation">S corporation</option>
                <option value="partnership">Partnership</option>
                <option value="trust_estate">Trust / estate</option>
                <option value="llc">LLC</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Exempt Payee Code (Optional)"
                value={(formData as W9FormData).exempt_payee_code}
                onChange={(value) => updateField("exempt_payee_code", value)}
              />
              <TextField
                label="Exempt FATCA Code (Optional)"
                value={(formData as W9FormData).exempt_fatca_code}
                onChange={(value) => updateField("exempt_fatca_code", value)}
              />
            </div>
            <TextField
              label="Address"
              value={(formData as W9FormData).address}
              onChange={(value) => updateField("address", value)}
            />
            <TextField
              label="City / State / ZIP"
              value={(formData as W9FormData).city_state_zip}
              onChange={(value) => updateField("city_state_zip", value)}
            />
            <TextField
              label="Taxpayer Identification Number"
              value={(formData as W9FormData).taxpayer_identification_number}
              onChange={(value) => updateField("taxpayer_identification_number", value)}
            />
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                SSN or EIN
              </label>
              <select
                value={(formData as W9FormData).tin_type}
                onChange={(event) => updateField("tin_type", event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Select one</option>
                <option value="ssn">SSN</option>
                <option value="ein">EIN</option>
              </select>
            </div>
            <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
              <input
                type="checkbox"
                checked={(formData as W9FormData).certification}
                onChange={(event) => updateField("certification", event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
              />
              <span className="text-sm leading-6 text-slate-700">
                I certify that the information provided on this form is true, correct, and complete.
              </span>
            </label>
          </>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Signature Name"
            value={formData.signature_name}
            onChange={(value) => updateField("signature_name", value)}
          />
          <TextField
            label="Signed Date"
            type="date"
            value={formData.signed_date}
            onChange={(value) => updateField("signed_date", value)}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving..." : `Save ${formLabel}`}
        </button>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function validateW4(data: W4FormData) {
  if (!data.first_name.trim()) return "Please enter your first name.";
  if (!data.last_name.trim()) return "Please enter your last name.";
  if (!data.address.trim()) return "Please enter your address.";
  if (!data.city.trim() || !data.state.trim() || !data.zip.trim()) {
    return "Please complete city, state, and ZIP.";
  }
  if (!data.ssn.trim()) return "Please enter your SSN.";
  if (!data.filing_status.trim()) return "Please select your filing status.";
  if (!data.signature_name.trim()) return "Please enter your signature name.";
  if (!data.signed_date) return "Please choose the signed date.";
  return "";
}

function validateW9(data: W9FormData) {
  if (!data.full_name.trim()) return "Please enter your full name.";
  if (!data.federal_tax_classification.trim()) {
    return "Please select a federal tax classification.";
  }
  if (!data.address.trim()) return "Please enter your address.";
  if (!data.city_state_zip.trim()) return "Please enter your city, state, and ZIP.";
  if (!data.taxpayer_identification_number.trim()) {
    return "Please enter your taxpayer identification number.";
  }
  if (!data.tin_type) return "Please choose SSN or EIN.";
  if (!data.certification) return "Please confirm the certification checkbox.";
  if (!data.signature_name.trim()) return "Please enter your signature name.";
  if (!data.signed_date) return "Please choose the signed date.";
  return "";
}
