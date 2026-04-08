import type { ReactNode } from "react";

type LeadSectionCardProps = {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function LeadSectionCard({ id, title, description, children, className = "" }: LeadSectionCardProps) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 sm:p-8 ${className}`}
    >
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
      {description ? (
        <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</div>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
