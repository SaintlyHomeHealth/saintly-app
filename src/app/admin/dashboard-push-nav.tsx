"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function DashboardPushActionCard({
  title,
  description,
  label,
  href,
}: {
  title: string;
  description: string;
  label: string;
  href: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="w-full rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
    >
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 inline-flex rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
        {label}
      </div>
    </button>
  );
}

export function DashboardPushLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <button type="button" className={className} onClick={() => router.push(href)}>
      {children}
    </button>
  );
}
