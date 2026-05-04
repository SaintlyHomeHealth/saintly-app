"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  EmploymentClassification,
  formatEmploymentClassificationLabel,
} from "@/lib/employee-contracts";
import {
  EmployeeTaxFormRow,
  getEmptyTaxFormData,
  getTaxFormLabel,
  getTaxFormTypeForClassification,
} from "@/lib/employee-tax-forms";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type Props = {
  applicantId: string;
  employmentClassification: EmploymentClassification | null;
  previewEmploymentClassification?: EmploymentClassification | null;
  initialTaxForm: EmployeeTaxFormRow | null;
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

function formatStatusLabel(status: EmployeeTaxFormRow["form_status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "completed":
      return "Completed";
    case "superseded":
      return "Superseded";
    case "void":
      return "Void";
    default:
      return status;
  }
}

function getStatusClasses(status: EmployeeTaxFormRow["form_status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "sent":
      return "bg-sky-50 text-sky-700";
    case "superseded":
      return "bg-slate-100 text-slate-700";
    case "void":
      return "bg-red-50 text-red-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export default function TaxFormsCard({
  applicantId,
  employmentClassification,
  previewEmploymentClassification,
  initialTaxForm,
}: Props) {
  const applicableFormType = useMemo(
    () => getTaxFormTypeForClassification(employmentClassification),
    [employmentClassification]
  );
  const previewApplicableFormType = useMemo(
    () => getTaxFormTypeForClassification(previewEmploymentClassification || null),
    [previewEmploymentClassification]
  );
  const [taxForm, setTaxForm] = useState<EmployeeTaxFormRow | null>(initialTaxForm);
  const [taxFormHistory, setTaxFormHistory] = useState<EmployeeTaxFormRow[]>(
    initialTaxForm ? [initialTaxForm] : []
  );
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const workflowFormType = previewApplicableFormType || applicableFormType;
  const activeTaxForm =
    taxForm?.form_type && applicableFormType && taxForm.form_type === applicableFormType
      ? taxForm
      : null;
  const workflowFormLabel = workflowFormType ? getTaxFormLabel(workflowFormType) : "Tax Form";
  const formLabel = applicableFormType ? getTaxFormLabel(applicableFormType) : "Tax Form";
  const currentFormLabel =
    activeTaxForm?.form_type
      ? getTaxFormLabel(activeTaxForm.form_type)
      : applicableFormType
      ? getTaxFormLabel(applicableFormType)
      : taxForm?.form_type
        ? getTaxFormLabel(taxForm.form_type)
        : formLabel;
  const lastSentAt = activeTaxForm?.admin_sent_at || null;

  useEffect(() => {
    let isActive = true;

    supabase
      .from("employee_tax_forms")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!isActive || error) {
          return;
        }

        const nextHistory = (data || []) as EmployeeTaxFormRow[];
        setTaxFormHistory(nextHistory);
        setTaxForm(nextHistory.find((row) => row.is_current) || null);
      });

    return () => {
      isActive = false;
    };
  }, [applicantId]);

  const loadTaxFormHistory = async () => {
    const { data, error } = await supabase
      .from("employee_tax_forms")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return;
    }

    const nextHistory = (data || []) as EmployeeTaxFormRow[];
    setTaxFormHistory(nextHistory);
    setTaxForm(nextHistory.find((row) => row.is_current) || null);
  };

  const insertTaxFormVersion = async (payload: {
    applicant_id: string;
    form_type: EmployeeTaxFormRow["form_type"];
    form_status: "draft" | "sent" | "completed" | "superseded" | "void";
    employment_classification: EmployeeTaxFormRow["employment_classification"];
    form_data: EmployeeTaxFormRow["form_data"];
    admin_sent_by: string | null;
    admin_sent_at: string | null;
    employee_signed_name: string | null;
    employee_signed_at: string | null;
  }) => {
    const insertTimestamp = new Date().toISOString();
    const currentTaxForm = taxFormHistory.find((row) => row.is_current) || taxForm;
    const nextVersionNumber =
      taxFormHistory.reduce((maxVersion, formRow) => {
        return Number.isFinite(formRow.version_number)
          ? Math.max(maxVersion, formRow.version_number)
          : maxVersion;
      }, 0) + 1;

    if (currentTaxForm) {
      const nextCurrentStatus =
        currentTaxForm.form_status === "void" ? "void" : "superseded";

      const { error: clearCurrentError } = await supabase
        .from("employee_tax_forms")
        .update({
          is_current: false,
          form_status: nextCurrentStatus,
          updated_at: insertTimestamp,
        })
        .eq("applicant_id", applicantId)
        .eq("is_current", true);

      if (clearCurrentError) {
        return { data: null, error: clearCurrentError };
      }
    }

    return supabase
      .from("employee_tax_forms")
      .insert({
        ...payload,
        version_number: nextVersionNumber,
        is_current: true,
        superseded_form_id: currentTaxForm?.id || null,
        created_at: insertTimestamp,
        updated_at: insertTimestamp,
      })
      .select("*")
      .single<EmployeeTaxFormRow>();
  };

  const handleSend = async () => {
    if (!applicableFormType || !employmentClassification) {
      setErrorMessage("Set the employment classification on the current contract before sending.");
      return;
    }

    setIsSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    const timestamp = new Date().toISOString();
    const baseFormData =
      activeTaxForm && activeTaxForm.form_type === applicableFormType
        ? activeTaxForm.form_data
        : getEmptyTaxFormData(applicableFormType);
    const payload = {
      applicant_id: applicantId,
      form_type: applicableFormType,
      form_status: "sent" as const,
      employment_classification: employmentClassification,
      form_data: baseFormData,
      admin_sent_by: activeTaxForm?.admin_sent_by || "Saintly Admin",
      admin_sent_at: timestamp,
      employee_signed_name: null,
      employee_signed_at: null,
    };

    const { data, error } = await insertTaxFormVersion(payload);

    setIsSending(false);

    if (error) {
      setErrorMessage(`We could not send the ${formLabel} right now. Please try again.`);
      return;
    }

    setTaxForm(data);
    await loadTaxFormHistory();
    setSuccessMessage(`${formLabel} sent to the employee portal.`);
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            Tax Forms
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {workflowFormType ? `${workflowFormLabel} workflow` : "Tax form workflow"}
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            Debug: classification={employmentClassification || "none"} | applicable=
            {applicableFormType || "none"} | current={taxForm?.form_type || "none"} | visible=
            {activeTaxForm?.form_type || "none"} | status={activeTaxForm?.form_status || "none"}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Tax forms are completed by the employee in the portal after being sent from admin.
          </p>
          {previewApplicableFormType && previewApplicableFormType !== applicableFormType ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This will become the active tax form after the new contract version is sent.
            </p>
          ) : null}
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Send the applicable tax form based on the current employment classification from the
            employee contract.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!applicableFormType || isSending}
          className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSending
            ? "Sending..."
            : activeTaxForm?.is_current && activeTaxForm.form_type === applicableFormType
            ? `Resend ${formLabel}`
            : applicableFormType === "w9"
            ? "Send W-9"
            : "Send W-4"}
        </button>
      </div>

      <div className="mt-6 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Classification
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {employmentClassification
              ? formatEmploymentClassificationLabel(employmentClassification)
              : "No current contract"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Current Form
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{currentFormLabel}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Last Sent
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {formatDateTime(lastSentAt)}
          </p>
        </div>
      </div>

      {activeTaxForm ? (
        <p className="mt-4 text-sm text-slate-600">
          Current status:{" "}
          <span className="font-semibold text-slate-900">
            {formatStatusLabel(activeTaxForm.form_status)}
          </span>
        </p>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-slate-900">Tax Form History</h3>

        <div className="mt-4 space-y-3">
          {taxFormHistory.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No tax form history yet.
            </div>
          ) : (
            taxFormHistory.map((historyForm) => (
              <div
                key={historyForm.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Version
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {historyForm.version_number}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Form
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {getTaxFormLabel(historyForm.form_type)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Classification
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {formatEmploymentClassificationLabel(
                        historyForm.employment_classification
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Status
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          historyForm.form_status
                        )}`}
                      >
                        {formatStatusLabel(historyForm.form_status)}
                      </span>
                      {historyForm.is_current ? (
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
                      {formatDateTime(historyForm.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
