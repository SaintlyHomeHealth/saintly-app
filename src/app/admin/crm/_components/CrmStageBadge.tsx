import type { CrmStage } from "@/lib/crm/crm-stage";
import { formatCrmStageLabel } from "@/lib/crm/crm-stage";

export function CrmStageBadge(props: { stage: CrmStage; className?: string }) {
  const { stage, className = "" } = props;
  const label = formatCrmStageLabel(stage);
  const tone =
    stage === "patient"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950 ring-emerald-200/60"
      : stage === "intake"
        ? "border-amber-300 bg-amber-50 text-amber-950 ring-amber-200/60"
        : "border-slate-300 bg-slate-50 text-slate-800 ring-slate-200/70";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ring-1 ${tone} ${className}`.trim()}
      title={`CRM stage: ${label}`}
    >
      CRM · {label}
    </span>
  );
}
