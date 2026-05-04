"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  buildEmployeeContractText,
  CONTRACT_ROLE_OPTIONS,
  ContractRoleKey,
  EmployeeContractRow,
  EmploymentClassification,
  EmploymentType,
  formatCurrency,
  formatEmploymentClassificationLabel,
  formatEmploymentTypeLabel,
  formatMileageTypeLabel,
  formatPayTypeLabel,
  getEmploymentAgreementTitle,
  MileageType,
  PayType,
} from "@/lib/employee-contracts";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type Props = {
  applicantId: string;
  employeeName: string;
  initialContract: EmployeeContractRow | null;
  suggestedRoleKey: ContractRoleKey | "";
  onPreviewEmploymentClassificationChange?: (value: EmploymentClassification | null) => void;
};

type FormState = {
  roleKey: ContractRoleKey | "";
  employmentClassification: EmploymentClassification;
  employmentType: EmploymentType;
  payType: PayType;
  payRate: string;
  mileageType: MileageType;
  mileageRate: string;
  effectiveDate: string;
  adminPreparedBy: string;
};

type ContractHistoryRow = EmployeeContractRow & {
  version_number?: number | string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return formatAppDateTime(value, value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function employeeContractUserMessage(error: { code?: string; message?: string } | null) {
  const code = error?.code;
  const msg = (error?.message || "").toLowerCase();
  if (
    code === "23505" ||
    msg.includes("employee_contracts_applicant_agreement_version_unique") ||
    msg.includes("employee_contracts_applicant_effective_unique")
  ) {
    return "A contract with this effective date already exists. Use Resend from Contract History or create a new version.";
  }
  return error?.message || "We could not save the employment contract right now. Please try again.";
}

function nextVersionForAgreement(
  rows: ContractHistoryRow[],
  applicantId: string,
  employmentClassification: EmploymentClassification
) {
  return (
    rows.reduce((maxVersion, contractRow) => {
      if (contractRow.applicant_id !== applicantId) return maxVersion;
      if (contractRow.employment_classification !== employmentClassification) return maxVersion;
      const versionNumber =
        typeof contractRow.version_number === "number"
          ? contractRow.version_number
          : Number(contractRow.version_number || 0);

      return Number.isFinite(versionNumber) ? Math.max(maxVersion, versionNumber) : maxVersion;
    }, 0) + 1
  );
}

function getInitialFormState(
  initialContract: EmployeeContractRow | null,
  suggestedRoleKey: ContractRoleKey | ""
): FormState {
  return {
    roleKey: initialContract?.role_key || suggestedRoleKey,
    employmentClassification: initialContract?.employment_classification || "employee",
    employmentType: initialContract?.employment_type || "prn",
    payType: initialContract?.pay_type || "per_visit",
    payRate:
      typeof initialContract?.pay_rate === "number"
        ? String(initialContract.pay_rate)
        : "",
    mileageType: initialContract?.mileage_type || "none",
    mileageRate:
      typeof initialContract?.mileage_rate === "number"
        ? String(initialContract.mileage_rate)
        : "",
    effectiveDate: initialContract?.effective_date || "",
    adminPreparedBy: initialContract?.admin_prepared_by || "",
  };
}

export default function EmploymentContractCard({
  applicantId,
  employeeName,
  initialContract,
  suggestedRoleKey,
  onPreviewEmploymentClassificationChange,
}: Props) {
  const router = useRouter();
  const [contract, setContract] = useState<EmployeeContractRow | null>(initialContract);
  const [form, setForm] = useState<FormState>(
    getInitialFormState(initialContract, suggestedRoleKey)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [contractHistory, setContractHistory] = useState<ContractHistoryRow[]>(
    initialContract ? [initialContract] : []
  );
  const [isEditingNewVersion, setIsEditingNewVersion] = useState(false);
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

  const isSigned = contract?.contract_status === "signed";
  const isLocked =
    contract?.contract_status === "sent" || contract?.contract_status === "signed";
  const isFormDisabled = isSaving || (isLocked && !isEditingNewVersion);

  const contractTextPreview = useMemo(() => {
    if (!form.roleKey || !form.effectiveDate || !form.payRate) {
      return "";
    }

    const payRate = Number(form.payRate);
    const mileageRate =
      form.mileageType === "per_mile" && form.mileageRate.trim().length > 0
        ? Number(form.mileageRate)
        : null;

    if (!Number.isFinite(payRate) || (mileageRate !== null && !Number.isFinite(mileageRate))) {
      return "";
    }

    return buildEmployeeContractText({
      roleKey: form.roleKey,
      employmentClassification: form.employmentClassification,
      employmentType: form.employmentType,
      payType: form.payType,
      payRate,
      mileageType: form.mileageType,
      mileageRate,
      effectiveDate: form.effectiveDate,
    });
  }, [form]);
  const contractHistoryPreview = contractHistory.slice(0, 3);

  const handleFieldChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    if (field === "employmentClassification" && isEditingNewVersion) {
      onPreviewEmploymentClassificationChange?.(value as EmploymentClassification);
    }
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const loadContractHistory = async () => {
    const { data, error } = await supabase
      .from("employee_contracts")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false });

    if (!error) {
      setContractHistory((data as ContractHistoryRow[]) || []);
    }
  };

  useEffect(() => {
    void loadContractHistory();
  }, [applicantId]);

  const insertContractVersion = async (
    payload: Omit<ContractHistoryRow, "id" | "created_at" | "updated_at"> & {
      contract_status: "draft" | "sent";
    }
  ) => {
    const insertTimestamp = new Date().toISOString();
    const nextVersionNumber = nextVersionForAgreement(
      contractHistory,
      applicantId,
      payload.employment_classification
    );

    await supabase.from("employee_contracts").update({ is_current: false }).eq("applicant_id", applicantId);

    const insertPayload = {
      applicant_id: payload.applicant_id,
      version_number: nextVersionNumber,
      is_current: true,
      created_at: insertTimestamp,
      updated_at: insertTimestamp,
      contract_status: payload.contract_status === "sent" ? "sent" : "draft",
      contract_text_snapshot: payload.contract_text_snapshot,
      role_key: payload.role_key,
      role_label: payload.role_label,
      employment_classification: payload.employment_classification,
      employment_type: payload.employment_type,
      pay_type: payload.pay_type,
      pay_rate: payload.pay_rate,
      mileage_type: payload.mileage_type,
      effective_date: payload.effective_date,
      ...(payload.mileage_rate !== undefined ? { mileage_rate: payload.mileage_rate } : {}),
      ...(payload.admin_prepared_by !== undefined
        ? { admin_prepared_by: payload.admin_prepared_by }
        : {}),
      ...(payload.admin_prepared_at !== undefined
        ? { admin_prepared_at: payload.admin_prepared_at }
        : {}),
      ...(payload.employee_signed_name !== undefined
        ? { employee_signed_name: payload.employee_signed_name }
        : {}),
      ...(payload.employee_signed_at !== undefined
        ? { employee_signed_at: payload.employee_signed_at }
        : {}),
    };

    return supabase
      .from("employee_contracts")
      .insert(insertPayload)
      .select("*")
      .single<ContractHistoryRow>();
  };

  const handleSave = async (status: "draft" | "sent") => {
    setErrorMessage("");
    setSuccessMessage("");
    const nextStatus: "draft" | "sent" = status;
    const liveForm = { ...form };

    if (!liveForm.roleKey) {
      setErrorMessage("Please select a role before saving the contract.");
      return;
    }

    if (!liveForm.effectiveDate) {
      setErrorMessage("Please choose an effective date.");
      return;
    }

    if (nextStatus === "draft" && !liveForm.adminPreparedBy.trim()) {
      setErrorMessage("Please enter who prepared this contract.");
      return;
    }

    const payRate = Number(liveForm.payRate);
    if (!Number.isFinite(payRate) || payRate < 0) {
      setErrorMessage("Please enter a valid pay rate.");
      return;
    }

    let mileageRate: number | null = null;
    if (liveForm.mileageType === "per_mile") {
      mileageRate = Number(liveForm.mileageRate);
      if (!Number.isFinite(mileageRate) || mileageRate < 0) {
        setErrorMessage("Please enter a valid mileage rate.");
        return;
      }
    }

    const roleOption = CONTRACT_ROLE_OPTIONS.find((option) => option.value === liveForm.roleKey);
    if (!roleOption) {
      setErrorMessage("Please select a supported role.");
      return;
    }

    const liveContractValues = {
      roleKey: liveForm.roleKey,
      roleLabel: roleOption.label,
      employmentClassification: liveForm.employmentClassification,
      employmentType: liveForm.employmentType,
      payType: liveForm.payType,
      payRate,
      mileageType: liveForm.mileageType,
      mileageRate,
      effectiveDate: liveForm.effectiveDate,
    };

    const timestamp = new Date().toISOString();
    const payload = {
      applicant_id: applicantId,
      role_key: liveContractValues.roleKey,
      role_label: liveContractValues.roleLabel,
      employment_classification: liveContractValues.employmentClassification,
      employment_type: liveContractValues.employmentType,
      pay_type: liveContractValues.payType,
      pay_rate: liveContractValues.payRate,
      mileage_type: liveContractValues.mileageType,
      mileage_rate: liveContractValues.mileageRate,
      effective_date: liveContractValues.effectiveDate,
      contract_status: nextStatus,
      contract_text_snapshot: buildEmployeeContractText(liveContractValues),
      admin_prepared_by: liveForm.adminPreparedBy.trim() || null,
      admin_prepared_at: timestamp,
      employee_signed_name: contract?.employee_signed_name || null,
      employee_signed_at: contract?.employee_signed_at || null,
    };

    const shouldUpdateExistingRow =
      Boolean(contract?.id) &&
      !isEditingNewVersion &&
      contract?.contract_status !== "sent" &&
      contract?.contract_status !== "signed";

    setIsSaving(true);

    let data: ContractHistoryRow | null = null;
    let error: { code?: string; message?: string } | null = null;

    if (shouldUpdateExistingRow && contract?.id) {
      const updatePayload = {
        updated_at: timestamp,
        contract_status: (nextStatus === "sent" ? "sent" : "draft") as "draft" | "sent",
        contract_text_snapshot: payload.contract_text_snapshot,
        role_key: payload.role_key,
        role_label: payload.role_label,
        employment_classification: payload.employment_classification,
        employment_type: payload.employment_type,
        pay_type: payload.pay_type,
        pay_rate: payload.pay_rate,
        mileage_type: payload.mileage_type,
        mileage_rate: payload.mileage_rate,
        effective_date: payload.effective_date,
        admin_prepared_by: payload.admin_prepared_by,
        admin_prepared_at: payload.admin_prepared_at,
      };

      const res = await supabase
        .from("employee_contracts")
        .update(updatePayload)
        .eq("id", contract.id)
        .select("*")
        .single<ContractHistoryRow>();

      data = res.data;
      error = res.error;
    } else {
      const res = await insertContractVersion(payload);
      data = res.data;
      error = res.error;
    }

    setIsSaving(false);

    if (error) {
      if (shouldUpdateExistingRow) {
        console.error("EMPLOYEE CONTRACT UPDATE ERROR:", error);
      } else {
        console.error("EMPLOYEE CONTRACT INSERT ERROR:", error);
        console.error("EMPLOYEE CONTRACT INSERT PAYLOAD:", payload);
      }
      setErrorMessage(employeeContractUserMessage(error));
      return;
    }

    setContract(data || null);
    setForm(getInitialFormState(data || null, suggestedRoleKey));
    setIsEditingNewVersion(false);
    onPreviewEmploymentClassificationChange?.(null);
    await loadContractHistory();
    setSuccessMessage(nextStatus === "sent" ? "Contract sent to employee." : "Draft saved.");
    router.refresh();
  };

  const handleResend = async (historyContract: ContractHistoryRow) => {
    if (historyContract.contract_status === "signed") {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const timestamp = new Date().toISOString();

    await supabase.from("employee_contracts").update({ is_current: false }).eq("applicant_id", applicantId);

    const { data, error } = await supabase
      .from("employee_contracts")
      .update({
        contract_status: "sent",
        admin_prepared_at: timestamp,
        updated_at: timestamp,
        is_current: true,
      })
      .eq("id", historyContract.id)
      .select("*")
      .single<ContractHistoryRow>();

    setIsSaving(false);

    if (error) {
      console.error("EMPLOYEE CONTRACT RESEND ERROR:", error);
      setErrorMessage(employeeContractUserMessage(error));
      return;
    }

    setContract(data || null);
    setForm(getInitialFormState(data || null, suggestedRoleKey));
    setIsEditingNewVersion(false);
    onPreviewEmploymentClassificationChange?.(null);
    await loadContractHistory();
    setSuccessMessage("Contract sent to employee.");
    router.refresh();
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Employment Contract</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create and send the employee&apos;s initial contract terms directly in the portal.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-700">
            Agreement Type: {getEmploymentAgreementTitle(form.employmentClassification)}
          </p>
          {isLocked ? (
            <>
              <p className="mt-2 text-sm font-medium text-amber-700">
                Current Contract Locked
              </p>
              <p className="mt-1 text-sm text-slate-500">
                To make changes, create a new contract version.
              </p>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLocked ? (
            <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Current Contract Locked
            </span>
          ) : null}
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
              contract?.contract_status === "signed"
                ? "border border-green-200 bg-green-50 text-green-700"
                : contract?.contract_status === "sent"
                ? "border border-sky-200 bg-sky-50 text-sky-700"
                : "border border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {contract?.contract_status ? contract.contract_status.replace("_", " ") : "draft"}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Role</label>
          <select
            value={form.roleKey}
            onChange={(event) =>
              handleFieldChange("roleKey", event.target.value as ContractRoleKey | "")
            }
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          >
            <option value="">Select role</option>
            {CONTRACT_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Employment Classification
          </label>
          <select
            value={form.employmentClassification}
            onChange={(event) =>
              handleFieldChange(
                "employmentClassification",
                event.target.value as EmploymentClassification
              )
            }
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          >
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Employment Type
          </label>
          <select
            value={form.employmentType}
            onChange={(event) =>
              handleFieldChange("employmentType", event.target.value as EmploymentType)
            }
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          >
            <option value="prn">PRN</option>
            <option value="part_time">Part-time</option>
            <option value="full_time">Full-time</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Pay Type</label>
          <select
            value={form.payType}
            onChange={(event) => handleFieldChange("payType", event.target.value as PayType)}
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          >
            <option value="per_visit">Per Visit</option>
            <option value="hourly">Hourly</option>
            <option value="salary">Salary</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Pay Rate</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.payRate}
            onChange={(event) => handleFieldChange("payRate", event.target.value)}
            disabled={isFormDisabled}
            placeholder="0.00"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Mileage Type</label>
          <select
            value={form.mileageType}
            onChange={(event) =>
              handleFieldChange("mileageType", event.target.value as MileageType)
            }
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          >
            <option value="none">No Mileage</option>
            <option value="per_mile">Per Mile</option>
          </select>
        </div>

        {form.mileageType === "per_mile" ? (
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Mileage Rate
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.mileageRate}
              onChange={(event) => handleFieldChange("mileageRate", event.target.value)}
              disabled={isFormDisabled}
              placeholder="0.00"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
            />
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Effective Date
          </label>
          <input
            type="date"
            value={form.effectiveDate}
            onChange={(event) => handleFieldChange("effectiveDate", event.target.value)}
            disabled={isFormDisabled}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Prepared By</label>
          <input
            type="text"
            value={form.adminPreparedBy}
            onChange={(event) => handleFieldChange("adminPreparedBy", event.target.value)}
            disabled={isFormDisabled}
            placeholder="Enter admin name"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Employee
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{employeeName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Prepared
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDateTime(contract?.admin_prepared_at)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Signed By Employee
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {contract?.employee_signed_name || "Not signed"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Signed At
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDateTime(contract?.employee_signed_at)}
          </p>
        </div>
      </div>

      {form.roleKey && form.payRate && form.effectiveDate ? (
        <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              {CONTRACT_ROLE_OPTIONS.find((option) => option.value === form.roleKey)?.title}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {formatEmploymentClassificationLabel(form.employmentClassification)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {formatEmploymentTypeLabel(form.employmentType)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {formatPayTypeLabel(form.payType)} {formatCurrency(form.payRate)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {formatMileageTypeLabel(form.mileageType)}
              {form.mileageType === "per_mile" && form.mileageRate
                ? ` ${formatCurrency(form.mileageRate)}`
                : ""}
            </span>
          </div>

          <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              {getEmploymentAgreementTitle(form.employmentClassification)} Preview
            </p>
            <p className="mt-2 text-sm text-slate-700">
              Contract body is collapsed on this dashboard page for readability. Use View or
              Print for full content.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {contractTextPreview ? "Contract text generated and ready." : "Complete fields to generate contract text."}
            </p>
          </div>
        </div>
      ) : null}

      {(errorMessage || successMessage) && (
        <div
          className={`mt-6 rounded-2xl border p-4 text-sm ${
            errorMessage
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {isLocked && !isEditingNewVersion ? (
          <button
            type="button"
            onClick={() => {
              setForm(getInitialFormState(contract, suggestedRoleKey));
              setIsEditingNewVersion(true);
              onPreviewEmploymentClassificationChange?.(
                contract?.employment_classification || form.employmentClassification || null
              );
              setErrorMessage("");
              setSuccessMessage("");
            }}
            disabled={isSaving}
            className="inline-flex min-w-[240px] items-center justify-center rounded-[24px] border border-sky-200 bg-sky-50 px-6 py-4 text-base font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create New Contract Version
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleSave("draft")}
          disabled={isSaving || (isLocked && !isEditingNewVersion)}
          className="inline-flex min-w-[180px] items-center justify-center rounded-[24px] border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={() => handleSave("sent")}
          disabled={isSaving || (isLocked && !isEditingNewVersion)}
          className="inline-flex min-w-[220px] items-center justify-center rounded-[24px] bg-gradient-to-r from-sky-600 to-cyan-500 px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Send to Employee"}
        </button>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Contract History</h3>
        </div>

        <div className="mt-4 space-y-3">
          {contractHistoryPreview.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No contract history yet.
            </div>
          ) : (
            contractHistoryPreview.map((historyContract) => {
              const isExpanded = expandedContractId === historyContract.id;
              const isCurrent = Boolean(historyContract.is_current);
              const isHistorySigned = historyContract.contract_status === "signed";

              return (
                <div
                  key={historyContract.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Version
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {historyContract.version_number || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Agreement Type
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {getEmploymentAgreementTitle(historyContract.employment_classification)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Pay
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {formatPayTypeLabel(historyContract.pay_type)}{" "}
                          {formatCurrency(historyContract.pay_rate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Status
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {historyContract.contract_status}
                          </span>
                          {isCurrent ? (
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                              Current
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Created
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {formatDateTime(historyContract.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedContractId(isExpanded ? null : historyContract.id)
                        }
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResend(historyContract)}
                        disabled={isSaving || isHistorySigned}
                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Resend
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4">
                      <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {historyContract.contract_text_snapshot}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
