import { LeadInsuranceSection } from "@/app/admin/crm/leads/_components/LeadInsuranceSection";
import { LeadMedicareFields } from "@/app/admin/crm/leads/_components/LeadMedicareFields";
import { LeadPayerInsuranceFields } from "@/app/admin/crm/leads/_components/LeadPayerInsuranceFields";
import type { InsurancePayer } from "@/lib/crm/insurance-payer-types";

type Props = {
  leadId: string;
  inp: string;
  primaryPayerType: string;
  primaryPayerName: string;
  secondaryPayerType: string;
  secondaryPayerName: string;
  insurancePayersCatalog: InsurancePayer[];
  primaryInsurancePath: string | null;
  secondaryInsurancePath: string | null;
  primaryInsuranceViewUrl: string | null;
  secondaryInsuranceViewUrl: string | null;
  medicareNumber: string;
  medicareEffectiveDateIso: string;
  medicareNotes: string;
};

export function LeadInsuranceCoverageFields(props: Props) {
  const {
    leadId,
    inp,
    primaryPayerType,
    primaryPayerName,
    secondaryPayerType,
    secondaryPayerName,
    insurancePayersCatalog,
    primaryInsurancePath,
    secondaryInsurancePath,
    primaryInsuranceViewUrl,
    secondaryInsuranceViewUrl,
    medicareNumber,
    medicareEffectiveDateIso,
    medicareNotes,
  } = props;

  return (
    <>
      <LeadInsuranceSection
        leadId={leadId}
        primaryPath={primaryInsurancePath}
        secondaryPath={secondaryInsurancePath}
        primaryViewUrl={primaryInsuranceViewUrl}
        secondaryViewUrl={secondaryInsuranceViewUrl}
      />
      <div className="mt-8 border-t border-slate-200/80 pt-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payer selection</p>
        <LeadPayerInsuranceFields
          inp={inp}
          primaryPayerType={primaryPayerType}
          primaryPayerName={primaryPayerName}
          secondaryPayerType={secondaryPayerType}
          secondaryPayerName={secondaryPayerName}
          idPrefix={`lead-${leadId}`}
          insurancePayersCatalog={insurancePayersCatalog}
        />
      </div>
      <div className="mt-8 border-t border-slate-200/80 pt-8">
        <LeadMedicareFields
          defaultNumber={medicareNumber}
          defaultEffectiveDate={medicareEffectiveDateIso}
          defaultNotes={medicareNotes}
        />
      </div>
    </>
  );
}
