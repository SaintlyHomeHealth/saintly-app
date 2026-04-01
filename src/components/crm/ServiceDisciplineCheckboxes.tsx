import { disciplineLabel, SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";

type Props = {
  name?: string;
  /** Selected discipline codes */
  defaultSelected?: string[] | null;
  className?: string;
};

export function ServiceDisciplineCheckboxes({ name = "service_disciplines", defaultSelected, className }: Props) {
  const selected = new Set((defaultSelected ?? []).map((s) => s.trim()).filter(Boolean));

  return (
    <div className={className ?? "flex flex-wrap gap-3"}>
      {SERVICE_DISCIPLINE_CODES.map((code) => (
        <label key={code} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-800">
          <input
            type="checkbox"
            name={name}
            value={code}
            defaultChecked={selected.has(code)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          {disciplineLabel(code)}
        </label>
      ))}
    </div>
  );
}
