"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteDraftDrill, saveDrill } from "@/lib/compliance/actions";
import { EXERCISE_TYPES } from "@/lib/compliance/constants";
import { complianceHref } from "@/lib/compliance/period";
import type { DrillRow } from "@/lib/compliance/types";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, SelectInput, SignatureFields, TextArea, TextInput } from "@/components/compliance/ui";

export function DrillForm({
  drill,
  year,
  quarter,
  signerName,
}: {
  drill: DrillRow | null;
  year: number;
  quarter: number;
  signerName: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = drill?.status === "finalized";
  const plan = drill?.plan_updated == null ? "" : drill.plan_updated ? "yes" : "no";

  async function submit(intent: "save" | "finalize") {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const data = new FormData(form);
    data.set("intent", intent === "finalize" ? "finalize" : "draft");
    const result = await saveDrill(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!drill && result.id) {
      router.push(`/admin/compliance/drills/${result.id}`);
      return;
    }
    router.refresh();
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <input type="hidden" name="id" value={drill?.id ?? ""} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Exercise date">
          <TextInput type="date" name="exercise_date" defaultValue={drill?.exercise_date ?? ""} disabled={locked} />
        </Field>
        <Field label="Exercise type">
          <SelectInput name="exercise_type" defaultValue={drill?.exercise_type ?? "tabletop"} disabled={locked}>
            {EXERCISE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
      <Field label="Scenario">
        <TextArea name="scenario" defaultValue={drill?.scenario ?? ""} disabled={locked} />
      </Field>
      <Field label="Participants">
        <TextArea name="participants" defaultValue={drill?.participants ?? ""} disabled={locked} />
      </Field>
      <Field label="What happened">
        <TextArea name="what_happened" defaultValue={drill?.what_happened ?? ""} disabled={locked} />
      </Field>
      <Field label="What worked">
        <TextArea name="what_worked" defaultValue={drill?.what_worked ?? ""} disabled={locked} />
      </Field>
      <Field label="What did not work">
        <TextArea name="what_did_not_work" defaultValue={drill?.what_did_not_work ?? ""} disabled={locked} />
      </Field>
      <Field label="Problems identified">
        <TextArea name="problems_identified" defaultValue={drill?.problems_identified ?? ""} disabled={locked} />
      </Field>
      <Field label="Corrective action">
        <TextArea name="corrective_action" defaultValue={drill?.corrective_action ?? ""} disabled={locked} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Person responsible">
          <TextInput name="person_responsible" defaultValue={drill?.person_responsible ?? ""} disabled={locked} />
        </Field>
        <Field label="Corrective action due date">
          <TextInput type="date" name="corrective_due_date" defaultValue={drill?.corrective_due_date ?? ""} disabled={locked} />
        </Field>
      </div>
      <Field label="Was the emergency plan updated?">
        <SelectInput name="plan_updated" defaultValue={plan} disabled={locked}>
          <option value="">Choose</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </SelectInput>
      </Field>
      <Field label="Additional notes">
        <TextArea name="additional_notes" defaultValue={drill?.additional_notes ?? ""} disabled={locked} />
      </Field>
      <SignatureFields
        prefix="admin"
        label="Administrator signature"
        defaultName={drill?.admin_signed_name || signerName}
        signedAt={drill?.admin_signed_at}
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
        {drill?.status === "draft" ? (
          <button
            type="button"
            className={saveButtonCls(false)}
            disabled={pending}
            onClick={async () => {
              if (!window.confirm("Delete this draft?")) return;
              const result = await deleteDraftDrill(drill.id);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push(complianceHref("/admin/compliance/drills", year, quarter));
            }}
          >
            Delete draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
