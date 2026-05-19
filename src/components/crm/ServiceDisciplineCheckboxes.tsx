import { disciplineLabel, SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";

type Props = {
  name?: string;
  /** Selected discipline codes */
  defaultSelected?: string[] | null;
  selected?: string[] | null;
  onSelectedChange?: (codes: string[]) => void;
  className?: string;
};

export function ServiceDisciplineCheckboxes({
  name = "service_disciplines",
  defaultSelected,
  selected: controlledSelected,
  onSelectedChange,
  className,
}: Props) {
  const selected = new Set((controlledSelected ?? defaultSelected ?? []).map((s) => s.trim()).filter(Boolean));

  function toggle(code: string, checked: boolean) {
    if (!onSelectedChange) return;
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onSelectedChange([...next]);
  }

  return (
    <div className={className ?? "flex flex-wrap gap-3"}>
      {SERVICE_DISCIPLINE_CODES.map((code) => (
        <label key={code} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-800">
          <input
            type="checkbox"
            name={name}
            value={code}
            defaultChecked={onSelectedChange ? undefined : selected.has(code)}
            checked={onSelectedChange ? selected.has(code) : undefined}
            onChange={(e) => toggle(code, e.target.checked)}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          {disciplineLabel(code)}
        </label>
      ))}
    </div>
  );
}
