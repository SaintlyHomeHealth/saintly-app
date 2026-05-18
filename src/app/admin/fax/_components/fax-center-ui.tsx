"use client";

import Image from "next/image";
import type { ReactNode } from "react";

/** Premium Fax Center design tokens (Tailwind class groups). */
export const faxUi = {
  overlay: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]",
  modal:
    "flex max-h-[92vh] w-full max-w-[44rem] flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_24px_80px_-12px_rgba(15,23,42,0.28)]",
  modalHeader:
    "relative border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-sky-50/30 px-6 py-5",
  modalBody: "flex-1 overflow-y-auto bg-white px-6 py-5",
  modalFooter: "flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4",
  section:
    "rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  sectionTitle: "text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500",
  sectionHint: "mt-0.5 text-xs leading-relaxed text-slate-500",
  label: "text-[11px] font-semibold text-slate-700",
  required: "text-rose-500",
  input:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  textarea:
    "w-full min-h-[5.5rem] resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  select:
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60",
  btnGhost:
    "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  btnSecondary:
    "inline-flex items-center justify-center rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50",
  btnPrimary:
    "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-lg hover:shadow-sky-200/60 disabled:translate-y-0 disabled:opacity-50",
  btnSend:
    "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200/50 transition hover:-translate-y-px hover:shadow-lg disabled:translate-y-0 disabled:opacity-50",
  alertError: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900",
  alertWarn: "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950",
  uploadZone:
    "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center transition hover:border-sky-300 hover:bg-sky-50/30",
  uploadZoneActive: "border-sky-400 bg-sky-50/50",
  fileRow:
    "flex cursor-grab items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm active:cursor-grabbing",
  fileRowOver: "border-sky-300 bg-sky-50/80 ring-2 ring-sky-100",
  previewFrame: "h-[min(52vh,520px)] w-full rounded-2xl border border-slate-200 bg-slate-100 shadow-inner",
  card: "overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-sm",
  pill: "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800",
  pillMuted:
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600",
  triggerBtn:
    "inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-lg",
} as const;

export const FAX_PACKET_STEPS = [
  { id: "compose" as const, label: "Cover sheet", short: "1" },
  { id: "attachments" as const, label: "Attachments", short: "2" },
  { id: "preview" as const, label: "Preview & send", short: "3" },
];

export type FaxPacketStepId = (typeof FAX_PACKET_STEPS)[number]["id"];

export function SaintlyLogoMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src="/saintly-logo.png"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain p-1"
        draggable={false}
      />
    </div>
  );
}

export function FaxPacketStepIndicator({ current }: { current: FaxPacketStepId }) {
  const idx = FAX_PACKET_STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Fax packet steps" className="mt-4 flex items-center gap-1">
      {FAX_PACKET_STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <FaxStepItem key={step.id} step={step} i={i} done={done} active={active} total={FAX_PACKET_STEPS.length} />
        );
      })}
    </nav>
  );
}

function FaxStepItem({
  step,
  i,
  done,
  active,
  total,
}: {
  step: (typeof FAX_PACKET_STEPS)[number];
  i: number;
  done: boolean;
  active: boolean;
  total: number;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
            active
              ? "bg-sky-600 text-white shadow-md shadow-sky-200/60"
              : done
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
          }`}
        >
          {done ? "✓" : step.short}
        </div>
        <span
          className={`hidden max-w-[7rem] truncate text-center text-[10px] font-semibold sm:block ${
            active ? "text-sky-800" : done ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          {step.label}
        </span>
      </div>
      {i < total - 1 ? <div className={`mx-1 mb-5 hidden h-px flex-1 sm:block ${done ? "bg-emerald-200" : "bg-slate-200"}`} aria-hidden /> : null}
    </>
  );
}

export function FaxSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={faxUi.section}>
      <div className="mb-3">
        <h3 className={faxUi.sectionTitle}>{title}</h3>
        {hint ? <p className={faxUi.sectionHint}>{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FaxField({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className={faxUi.label}>
        {label}
        {required ? <span className={faxUi.required}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function FaxToast({ type, message }: { type: "ok" | "err"; message: string }) {
  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${
        type === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-rose-200 bg-rose-50 text-rose-950"
      }`}
    >
      {message}
    </div>
  );
}
