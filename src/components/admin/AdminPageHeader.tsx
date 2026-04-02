import type { ReactNode } from "react";

export type AdminPageHeaderAccent = "sky" | "indigo";

type AdminPageHeaderProps = {
  /** Shown as a compact Saintly-style pill (uppercase tracking). */
  eyebrow?: string;
  accent?: AdminPageHeaderAccent;
  title: string;
  /** Optional line under title (e.g. role / context). */
  metaLine?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Renders below the hero gradient inside the same card (e.g. KPI strip). */
  footer?: ReactNode;
  className?: string;
};

const ACCENT = {
  sky: {
    shell: "border-slate-200/90 shadow-md shadow-slate-200/25 ring-1 ring-sky-100/50",
    gradient: "bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/50",
    eyebrowPill: "border-sky-200/70 bg-white/90 text-sky-800 shadow-sm",
    footer: "border-t border-slate-100/90 bg-gradient-to-b from-sky-50/35 to-white",
  },
  indigo: {
    shell: "border-indigo-100/90 shadow-md shadow-indigo-100/25 ring-1 ring-indigo-100/55",
    gradient: "bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/40",
    eyebrowPill: "border-indigo-200/80 bg-white/95 text-indigo-900 shadow-sm",
    footer: "border-t border-indigo-100/80 bg-gradient-to-b from-indigo-50/30 to-white",
  },
} as const;

/**
 * Premium admin hero: soft Saintly gradient, rounded card, strong type hierarchy, optional actions and footer.
 * Use across CRM, credentialing, phone, HR, and Command Center for visual consistency.
 */
export function AdminPageHeader({
  eyebrow,
  accent = "sky",
  title,
  metaLine,
  description,
  actions,
  footer,
  className = "",
}: AdminPageHeaderProps) {
  const a = ACCENT[accent];

  return (
    <section
      className={`overflow-hidden rounded-[28px] bg-white ${a.shell} ${className}`.trim()}
    >
      <div className={`${a.gradient} px-5 py-5 sm:px-8 sm:py-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 max-w-2xl">
            {eyebrow ? (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${a.eyebrowPill}`}
              >
                {eyebrow}
              </span>
            ) : null}
            <h1
              className={`font-bold tracking-tight text-slate-900 ${eyebrow ? "mt-3" : ""} text-2xl sm:text-[1.65rem] sm:leading-snug`}
            >
              {title}
            </h1>
            {metaLine ? (
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">{metaLine}</div>
            ) : null}
            {description ? (
              <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:items-end lg:w-auto lg:min-w-[min(100%,420px)]">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
      {footer ? <div className={`px-5 py-4 sm:px-8 sm:py-5 ${a.footer}`}>{footer}</div> : null}
    </section>
  );
}
