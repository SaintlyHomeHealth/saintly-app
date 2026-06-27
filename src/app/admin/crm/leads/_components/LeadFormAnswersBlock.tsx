import type { LeadFormAnswer } from "@/lib/crm/lead-form-answers";

type Props = {
  answers: LeadFormAnswer[];
  compact?: boolean;
  title?: string;
};

export function LeadFormAnswersBlock({
  answers,
  compact,
  title = "Lead form answers",
}: Props) {
  if (answers.length === 0) return null;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-violet-200/90 bg-violet-50/70 px-2.5 py-2 ring-1 ring-violet-100/80"
          : "rounded-xl border border-violet-200/90 bg-gradient-to-r from-violet-50/90 via-white to-fuchsia-50/60 px-4 py-3 ring-1 ring-violet-100/80"
      }
    >
      <p
        className={
          compact
            ? "text-[10px] font-bold uppercase tracking-wide text-violet-900"
            : "text-[11px] font-bold uppercase tracking-wide text-violet-900"
        }
      >
        {title}
      </p>
      <dl className={compact ? "mt-1.5 space-y-1" : "mt-2 grid gap-2 sm:grid-cols-2"}>
        {answers.map((row) => (
          <div key={row.key} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-violet-800/80">{row.label}</dt>
            <dd className={`whitespace-pre-wrap text-slate-900 ${compact ? "text-xs leading-snug" : "text-sm font-medium leading-snug"}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
