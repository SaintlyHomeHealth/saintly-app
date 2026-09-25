"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markFaxFiledInAloraAction } from "@/app/admin/fax/actions";
import { crmActionBtnMuted } from "@/components/admin/crm-admin-list-styles";

type MarkFaxFiledButtonProps = {
  faxId: string;
  compact?: boolean;
};

export function MarkFaxFiledButton({ faxId, compact = false }: MarkFaxFiledButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function markFiled() {
    setError(null);
    startTransition(async () => {
      const result = await markFaxFiledInAloraAction(faxId);
      if (!result.ok) {
        setError(result.error ?? "Could not mark this fax filed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={markFiled}
        disabled={isPending}
        className={
          compact
            ? "rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
            : `${crmActionBtnMuted} border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100`
        }
      >
        {isPending ? "Marking…" : "Mark filed in Alora"}
      </button>
      {error ? <span className="max-w-[14rem] text-[11px] font-medium text-rose-700">{error}</span> : null}
    </span>
  );
}
