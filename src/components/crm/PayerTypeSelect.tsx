import { PAYER_BROAD_CATEGORY_OPTIONS, isKnownPayerBroadCategory } from "@/lib/crm/payer-type-options";

type Props = {
  name: string;
  defaultValue?: string | null;
  className: string;
  id?: string;
};

/**
 * Broad payer category (`payer_type`). Unknown legacy values get an extra option so the current value round-trips.
 */
export function PayerTypeSelect({ name, defaultValue, className, id }: Props) {
  const dv = (defaultValue ?? "").trim();
  const legacy = dv && !isKnownPayerBroadCategory(dv) ? dv : null;

  return (
    <select name={name} id={id} className={className} defaultValue={legacy ?? dv}>
      <option value="">—</option>
      {PAYER_BROAD_CATEGORY_OPTIONS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      {legacy ? (
        <option value={legacy}>
          {legacy} (legacy)
        </option>
      ) : null}
    </select>
  );
}
