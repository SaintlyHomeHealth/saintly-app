"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { markNotApplicable, unlockComplianceRecord } from "@/lib/compliance/actions";
import type { NaItemKey } from "@/lib/compliance/constants";
import { primaryBtnCls, secondaryBtnCls, TextInput } from "@/components/compliance/ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className={secondaryBtnCls} onClick={() => window.print()}>
      {label}
    </button>
  );
}

export function UnlockForm({
  entity,
  id,
}: {
  entity: "meeting" | "safety" | "emergency_review" | "drill" | "qapi_review";
  id: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const result = await unlockComplianceRecord(entity, id, reason);
        setPending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      }}
    >
      <p className="text-sm font-semibold text-amber-950">This form is finalized. An admin can unlock it to make a correction.</p>
      <label className="mt-3 block text-sm font-semibold text-slate-800">
        Reason
        <TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What needs to be corrected?" />
      </label>
      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
      <button type="submit" className={`${secondaryBtnCls} mt-3`} disabled={pending}>
        {pending ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}

export function NotApplicableForm({
  year,
  quarter,
  itemKey,
  already,
  reason,
}: {
  year: number;
  quarter: number;
  itemKey: NaItemKey;
  already?: boolean;
  reason?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (already) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Marked not applicable{reason ? `: ${reason}` : "."}
      </p>
    );
  }

  return (
    <form
      className="rounded-2xl border border-dashed border-slate-300 bg-white p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const result = await markNotApplicable(new FormData(event.currentTarget));
        setPending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      }}
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <input type="hidden" name="item_key" value={itemKey} />
      <p className="text-sm font-semibold text-slate-800">Not needed this quarter?</p>
      <label className="mt-2 block text-sm font-medium text-slate-700">
        Reason
        <TextInput name="reason" placeholder="Short reason for the binder" />
      </label>
      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
      <button type="submit" className={`${secondaryBtnCls} mt-3`} disabled={pending}>
        {pending ? "Saving…" : "Mark not applicable"}
      </button>
    </form>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{message}</p>;
}

export function saveButtonCls(primary = false): string {
  return primary ? primaryBtnCls : secondaryBtnCls;
}
