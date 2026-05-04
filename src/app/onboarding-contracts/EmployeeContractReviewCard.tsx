"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  EmployeeContractRow,
  getEmploymentAgreementTitle,
} from "@/lib/employee-contracts";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type Props = {
  applicantId: string;
  sectionId?: string;
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

export default function EmployeeContractReviewCard({ applicantId, sectionId }: Props) {
  const [contract, setContract] = useState<EmployeeContractRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fullName, setFullName] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!applicantId) return;

    const loadContract = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("employee_contracts")
        .select("*")
        .eq("applicant_id", applicantId)
        .eq("is_current", true)
        .maybeSingle<EmployeeContractRow>();

      setIsLoading(false);

      if (error) {
        setErrorMessage("We could not load your employment contract right now.");
        return;
      }

      if (!data || (data.contract_status !== "sent" && data.contract_status !== "signed")) {
        setContract(null);
        return;
      }

      setContract(data);
      setAcknowledged(data.contract_status === "signed");
      setFullName(data.employee_signed_name || "");
      setSignedDate(
        data.employee_signed_at ? data.employee_signed_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
      );
    };

    loadContract();
  }, [applicantId]);

  const handleSign = async () => {
    if (!contract) return;

    setErrorMessage("");
    setSuccessMessage("");

    if (!acknowledged) {
      setErrorMessage("Please confirm that you reviewed the contract before signing.");
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full legal name.");
      return;
    }

    if (!signedDate) {
      setErrorMessage("Please choose the signed date.");
      return;
    }

    setIsSigning(true);

    const signedAt = new Date(`${signedDate}T12:00:00Z`).toISOString();
    const payload = {
      contract_status: "signed" as const,
      employee_signed_name: fullName.trim(),
      employee_signed_at: signedAt,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("employee_contracts")
      .update(payload)
      .eq("id", contract.id)
      .select("*")
      .maybeSingle<EmployeeContractRow>();

    setIsSigning(false);

    if (error) {
      setErrorMessage("We could not sign the contract right now. Please try again.");
      return;
    }

    setContract(data || { ...contract, ...payload });
    setSuccessMessage("Employment contract signed.");
  };

  if (isLoading || !contract) {
    return null;
  }

  const isSigned = contract.contract_status === "signed";
  const agreementTitle = getEmploymentAgreementTitle(
    contract.employment_classification
  );

  return (
    <div id={sectionId} className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
            {agreementTitle}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Review and sign your agreement
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This agreement was prepared by Saintly Home Health and sent to you for review in the
            portal.
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            isSigned ? "bg-teal-50 text-teal-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {isSigned ? "Signed" : "Awaiting Signature"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Role
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{contract.role_label}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Effective Date
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{contract.effective_date}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Prepared By
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {contract.admin_prepared_by || "Saintly Admin"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Sent / Signed
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {isSigned ? formatDateTime(contract.employee_signed_at) : formatDateTime(contract.admin_prepared_at)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {agreementTitle}
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {contract.contract_text_snapshot}
          </pre>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => {
                setAcknowledged(event.target.checked);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              disabled={isSigned}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
            />
            <span className="text-sm leading-6 text-slate-700">
              I have reviewed the {agreementTitle.toLowerCase()} and understand the terms
              presented above.
            </span>
          </label>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Full legal name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              disabled={isSigned}
              placeholder="Type your full legal name"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Signed date
            </label>
            <input
              type="date"
              value={signedDate}
              onChange={(event) => {
                setSignedDate(event.target.value);
                setErrorMessage("");
                setSuccessMessage("");
              }}
              disabled={isSigned}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-50"
            />
          </div>

          {!isSigned ? (
            <button
              type="button"
              onClick={handleSign}
              disabled={isSigning}
              className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSigning ? "Signing..." : "Sign Contract"}
            </button>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              Signed by {contract.employee_signed_name} on {formatDateTime(contract.employee_signed_at)}.
            </div>
          )}

          {(errorMessage || successMessage) && (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                errorMessage
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {errorMessage || successMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
