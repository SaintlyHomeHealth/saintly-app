"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ContractRoleKey,
  EmployeeContractRow,
} from "@/lib/employee-contracts";
import { EmployeeTaxFormRow, getTaxFormLabel } from "@/lib/employee-tax-forms";
import EmployeeContractTaxSection from "./EmployeeContractTaxSection";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

function formatDateTimeLocal(iso?: string | null) {
  if (!iso) return "—";
  return formatAppDateTime(iso, iso, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function contractStatusLabel(status?: EmployeeContractRow["contract_status"] | null) {
  if (!status) return "Not started";
  return status.replace(/_/g, " ");
}

function taxStatusLabel(form: EmployeeTaxFormRow | null) {
  if (!form?.form_status) return "Not started";
  switch (form.form_status) {
    case "completed":
      return "Completed";
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "void":
      return "Void";
    default:
      return String(form.form_status).replace(/_/g, " ");
  }
}

type Props = {
  employeeId: string;
  employeeName: string;
  employeePageBase: string;
  showWorkflowInitially: boolean;
  initialContract: EmployeeContractRow | null;
  /** Server-side load warning (contract fetch); page still renders. */
  contractLoadError?: string | null;
  suggestedRoleKey: ContractRoleKey | "";
  initialTaxForm: EmployeeTaxFormRow | null;
  contractPdfHref: string | null;
  taxFormPdfHref: string | null;
  isTaxFormSigned: boolean;
};

export default function EmployeeContractTaxWorkflow({
  employeeId,
  employeeName,
  employeePageBase,
  showWorkflowInitially,
  initialContract,
  contractLoadError = null,
  suggestedRoleKey,
  initialTaxForm,
  contractPdfHref,
  taxFormPdfHref,
  isTaxFormSigned,
}: Props) {
  const router = useRouter();
  const [showWorkflow, setShowWorkflow] = useState(showWorkflowInitially);

  useEffect(() => {
    setShowWorkflow(showWorkflowInitially);
  }, [showWorkflowInitially]);

  const workflowHref = `${employeePageBase}?contractsWorkflow=1#contract-tax-workflow`;

  const collapseWorkflow = useCallback(() => {
    setShowWorkflow(false);
    router.replace(employeePageBase, { scroll: false });
  }, [employeePageBase, router]);

  const contract = initialContract;
  const contractLast =
    contract?.employee_signed_at ||
    contract?.admin_prepared_at ||
    contract?.updated_at ||
    contract?.created_at ||
    null;
  const taxLast =
    initialTaxForm?.employee_signed_at ||
    initialTaxForm?.admin_sent_at ||
    initialTaxForm?.updated_at ||
    initialTaxForm?.created_at ||
    null;

  const contractCanSend = Boolean(contract && contract.contract_status === "draft");
  const taxCanSend = Boolean(
    contract?.employment_classification && !isTaxFormSigned && initialTaxForm?.form_status !== "void"
  );

  const contractViewable = Boolean(contractPdfHref && contract?.contract_status === "signed");
  const taxViewable = Boolean(taxFormPdfHref && isTaxFormSigned);

  return (
    <div id="tax-forms-section" className="min-w-0 scroll-mt-24 space-y-3">
      {contractLoadError ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <p className="font-semibold">Employment contract data could not be loaded completely</p>
          <p className="mt-1 text-amber-950/90">{contractLoadError}</p>
          <p className="mt-2 text-xs text-amber-900/80">
            Other employee sections should still work. If the problem continues, check server logs for{" "}
            <code className="rounded bg-amber-100/80 px-1">admin_employee_detail.employee_contracts</code>.
          </p>
        </div>
      ) : null}
      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last sent / updated</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-3 py-2 font-medium text-slate-900">Employment Contract</td>
              <td className="px-3 py-2">
                <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold capitalize text-slate-800">
                  {contractStatusLabel(contract?.contract_status)}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">{formatDateTimeLocal(contractLast)}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  <Link
                    href={workflowHref}
                    onClick={() => setShowWorkflow(true)}
                    className="text-xs font-semibold text-sky-700 underline"
                  >
                    Open
                  </Link>
                  {contractCanSend ? (
                    <Link
                      href={workflowHref}
                      onClick={() => setShowWorkflow(true)}
                      className="text-xs font-semibold text-sky-700 underline"
                    >
                      Send
                    </Link>
                  ) : null}
                  {contractViewable && contractPdfHref ? (
                    <a
                      href={contractPdfHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-sky-700 underline"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 font-medium text-slate-900">Tax Form</td>
              <td className="px-3 py-2">
                <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">
                  {initialTaxForm?.form_type
                    ? `${getTaxFormLabel(initialTaxForm.form_type)} · ${taxStatusLabel(initialTaxForm)}`
                    : taxStatusLabel(null)}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">{formatDateTimeLocal(taxLast)}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                  <Link
                    href={workflowHref}
                    onClick={() => setShowWorkflow(true)}
                    className="text-xs font-semibold text-sky-700 underline"
                  >
                    Open
                  </Link>
                  {taxCanSend ? (
                    <Link
                      href={workflowHref}
                      onClick={() => setShowWorkflow(true)}
                      className="text-xs font-semibold text-sky-700 underline"
                    >
                      Send
                    </Link>
                  ) : null}
                  {taxViewable && taxFormPdfHref ? (
                    <a
                      href={taxFormPdfHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-sky-700 underline"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {showWorkflow ? (
        <div id="contract-tax-workflow" className="scroll-mt-24 space-y-2 border border-slate-200 bg-slate-50/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">Contract & tax workflow</p>
            <button
              type="button"
              onClick={collapseWorkflow}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hide workflow
            </button>
          </div>
          <div className="rounded border border-slate-200 bg-white p-3">
            <EmployeeContractTaxSection
              applicantId={employeeId}
              employeeName={employeeName}
              initialContract={initialContract}
              contractLoadError={contractLoadError}
              suggestedRoleKey={suggestedRoleKey}
              initialTaxForm={initialTaxForm}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
