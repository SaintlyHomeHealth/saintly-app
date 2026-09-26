"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveEmergencyReview } from "@/lib/compliance/actions";
import { EMERGENCY_REVIEW_ITEMS } from "@/lib/compliance/constants";
import type { EmergencyReviewRow } from "@/lib/compliance/types";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Checklist, Field, SignatureFields, TextArea, TextInput } from "@/components/compliance/ui";

export function EmergencyReviewForm({
  row,
  year,
  quarter,
  signerName,
  today,
}: {
  row: EmergencyReviewRow | null;
  year: number;
  quarter: number;
  signerName: string;
  today: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [changesRequired, setChangesRequired] = useState(row?.changes_required === true);
  const locked = row?.status === "finalized";

  async function submit(intent: "save" | "finalize") {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const data = new FormData(form);
    data.set("intent", intent === "finalize" ? "finalize" : "draft");
    data.set("changes_required", changesRequired ? "yes" : "no");
    const result = await saveEmergencyReview(data);
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
        <Field label="Review date">
          <TextInput type="date" name="review_date" defaultValue={row?.review_date ?? today} disabled={locked} />
        </Field>
        <Field label="Reviewed by">
          <TextInput name="reviewed_by_name" defaultValue={row?.reviewed_by_name || signerName} disabled={locked} />
        </Field>
      </div>
      <Checklist items={EMERGENCY_REVIEW_ITEMS} checks={row?.checks} disabled={locked} />
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <input
            type="radio"
            name="changes_required_ui"
            checked={!changesRequired}
            disabled={locked}
            onChange={() => setChangesRequired(false)}
          />
          No changes needed
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <input
            type="radio"
            name="changes_required_ui"
            checked={changesRequired}
            disabled={locked}
            onChange={() => setChangesRequired(true)}
          />
          Changes required
        </label>
      </div>
      {changesRequired ? (
        <div className="grid gap-4">
          <Field label="Changes made">
            <TextArea name="changes_made" defaultValue={row?.changes_made ?? ""} disabled={locked} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date updated">
              <TextInput type="date" name="date_updated" defaultValue={row?.date_updated ?? ""} disabled={locked} />
            </Field>
            <Field label="Updated by">
              <TextInput name="updated_by_name" defaultValue={row?.updated_by_name ?? ""} disabled={locked} />
            </Field>
          </div>
        </div>
      ) : null}
      <SignatureFields
        prefix="admin"
        label="Administrator signature"
        defaultName={row?.admin_signed_name || signerName}
        signedAt={row?.admin_signed_at}
        disabled={locked}
      />
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
