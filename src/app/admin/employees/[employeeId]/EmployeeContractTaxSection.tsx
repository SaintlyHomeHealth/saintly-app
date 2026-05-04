"use client";

import { useState } from "react";
import {
  ContractRoleKey,
  EmployeeContractRow,
  EmploymentClassification,
} from "@/lib/employee-contracts";
import { EmployeeTaxFormRow } from "@/lib/employee-tax-forms";
import EmploymentContractCard from "./EmploymentContractCard";
import TaxFormsCard from "./TaxFormsCard";

type Props = {
  applicantId: string;
  employeeName: string;
  initialContract: EmployeeContractRow | null;
  contractLoadError?: string | null;
  suggestedRoleKey: ContractRoleKey | "";
  initialTaxForm: EmployeeTaxFormRow | null;
};

export default function EmployeeContractTaxSection({
  applicantId,
  employeeName,
  initialContract,
  contractLoadError = null,
  suggestedRoleKey,
  initialTaxForm,
}: Props) {
  const [previewEmploymentClassification, setPreviewEmploymentClassification] =
    useState<EmploymentClassification | null>(null);

  return (
    <>
      <EmploymentContractCard
        applicantId={applicantId}
        employeeName={employeeName}
        initialContract={initialContract}
        serverLoadError={contractLoadError}
        suggestedRoleKey={suggestedRoleKey}
        onPreviewEmploymentClassificationChange={setPreviewEmploymentClassification}
      />

      <TaxFormsCard
        key={`${initialContract?.id || "none"}-${initialContract?.employment_classification || "none"}`}
        applicantId={applicantId}
        employmentClassification={initialContract?.employment_classification || null}
        previewEmploymentClassification={previewEmploymentClassification}
        initialTaxForm={initialTaxForm}
      />
    </>
  );
}
