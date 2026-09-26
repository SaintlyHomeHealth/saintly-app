"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveSafety } from "@/lib/compliance/actions";
import { SAFETY_ITEMS } from "@/lib/compliance/constants";
import type { SafetyRow } from "@/lib/compliance/types";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Checklist, Field, SignatureFields, TextArea, TextInput } from "@/components/compliance/ui";

export function SafetyForm({
  row,
  year,
  quarter,
  signerName,
  today,
}: {
  row: SafetyRow | null;
  year: number;
  quarter: number;
  signerName: string;
  today: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = row?.status === "finalized";

  async function submit(intent: "save" | "finalize") {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const data = new FormData(form);
    data.set("intent", intent === "finalize" ? "finalize" : "draft");
    const result = await saveSafety(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inspection date">
          <TextInput type="date" name="inspection_date" defaultValue={row?.inspection_date ?? today} disabled={locked} />
        </Field>
        <Field label="Completed by">
          <TextInput name="completed_by_name" defaultValue={row?.completed_by_name || signerName} disabled={locked} />
        </Field>
      </div>
      <Checklist items={SAFETY_ITEMS} checks={row?.checks} disabled={locked} />
      <Field label="Problems found">
        <TextArea name="problems_found" defaultValue={row?.problems_found ?? ""} disabled={locked} />
      </Field>
      <Field label="Corrective action">
        <TextArea name="corrective_action" defaultValue={row?.corrective_action ?? ""} disabled={locked} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date corrected">
          <TextInput type="date" name="date_corrected" defaultValue={row?.date_corrected ?? ""} disabled={locked} />
        </Field>
        <Field label="Corrected by">
          <TextInput name="corrected_by" defaultValue={row?.corrected_by ?? ""} disabled={locked} />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SignatureFields
          prefix="completed"
          label="Completed by signature"
          defaultName={row?.completed_signed_name || signerName}
          signedAt={row?.completed_signed_at}
          disabled={locked}
        />
        <SignatureFields
          prefix="admin"
          label="Administrator signature"
          defaultName={row?.admin_signed_name || signerName}
          signedAt={row?.admin_signed_at}
          disabled={locked}
        />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={saveButtonCls(false)} disabled={pending || locked} onClick={() => submit("save")}>
          Save
        </button>
        <button type="button" className={saveButtonCls(true)} disabled={pending || locked} onClick={() => submit("finalize")}>
          Finalize
        </button>
        <PrintButton />
      </div>
    </form>
  );
}
