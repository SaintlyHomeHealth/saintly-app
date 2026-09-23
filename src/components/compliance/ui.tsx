import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { CHECKLIST_STATUS_LABEL, ROLLUP_LABEL, type ChecklistStatus, type QuarterRollup } from "@/lib/compliance/status";

export const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50";

export const labelCls = "block text-sm font-semibold text-slate-800";

export const primaryBtnCls =
  "inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryBtnCls =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_CLS: Record<ChecklistStatus, string> = {
  complete: "bg-emerald-100 text-emerald-900",
  due_soon: "bg-amber-100 text-amber-950",
  not_complete: "bg-rose-100 text-rose-900",
  not_applicable: "bg-slate-100 text-slate-600",
};

const ROLLUP_CLS: Record<QuarterRollup, string> = {
  complete: "bg-emerald-100 text-emerald-900",
  needs_attention: "bg-amber-100 text-amber-950",
  not_started: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: ChecklistStatus }) {
  return (
    <span className={`inline-flex min-w-[8.5rem] justify-center rounded-full px-3 py-1 text-sm font-bold ${STATUS_CLS[status]}`}>
      {CHECKLIST_STATUS_LABEL[status]}
    </span>
  );
}

export function RollupBadge({ status }: { status: QuarterRollup }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${ROLLUP_CLS[status]}`}>
      {ROLLUP_LABEL[status]}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`.trim()} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} min-h-24 ${props.className ?? ""}`.trim()} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`.trim()} />;
}

export function timeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function Checklist({
  items,
  checks,
  disabled,
}: {
  items: readonly (readonly [string, string])[];
  checks: Record<string, boolean> | null | undefined;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([key, label]) => (
        <label key={key} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            name={`check_${key}`}
            value="yes"
            defaultChecked={checks?.[key] === true}
            disabled={disabled}
            className="mt-0.5 h-5 w-5 rounded border-slate-300 text-sky-600"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

export function SignatureFields({
  prefix,
  label,
  optional,
  defaultName,
  signedAt,
  disabled,
}: {
  prefix: "admin" | "clinical" | "completed";
  label: string;
  optional?: boolean;
  defaultName: string;
  signedAt?: string | null;
  disabled?: boolean;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-bold text-slate-900">
        {label}
        {optional ? " (optional)" : ""}
      </legend>
      <Field label="Typed name">
        <TextInput name={`${prefix}_signed_name`} defaultValue={defaultName} autoComplete="name" />
      </Field>
      <label className="mt-3 flex items-start gap-3 text-sm font-medium text-slate-800">
        <input type="checkbox" name={`${prefix}_sign_confirm`} value="yes" className="mt-0.5 h-5 w-5" />
        <span>I confirm this typed name is my electronic signature for this form.</span>
      </label>
      {signedAt ? <p className="mt-2 text-xs font-medium text-slate-500">Previously signed {signedAt}</p> : null}
    </fieldset>
  );
}
