import type { FacebookWoundCareLeadAnswers } from "@/lib/facebook/facebook-wound-care-lead-display";

type Props = {
  answers: FacebookWoundCareLeadAnswers;
  compact?: boolean;
};

export function FacebookWoundCareAnswersBlock({ answers, compact }: Props) {
  const rows = [
    answers.insurance ? { label: "Insurance", value: answers.insurance } : null,
    answers.woundCareNeeded ? { label: "Wound care needed", value: answers.woundCareNeeded } : null,
    answers.careFor ? { label: "Care for", value: answers.careFor } : null,
    answers.city ? { label: "City", value: answers.city } : null,
    answers.source ? { label: "Source", value: answers.source } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  if (rows.length === 0) return null;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-sky-200/90 bg-sky-50/70 px-2.5 py-2 ring-1 ring-sky-100/80"
          : "rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50/90 via-white to-cyan-50/60 px-4 py-3 ring-1 ring-sky-100/80"
      }
    >
      <p
        className={
          compact
            ? "text-[10px] font-bold uppercase tracking-wide text-sky-900"
            : "text-[11px] font-bold uppercase tracking-wide text-sky-900"
        }
      >
        Facebook wound care lead
      </p>
      <dl className={compact ? "mt-1.5 space-y-1" : "mt-2 grid gap-2 sm:grid-cols-2"}>
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">{row.label}</dt>
            <dd className={`text-slate-900 ${compact ? "text-xs leading-snug" : "text-sm font-medium leading-snug"}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
