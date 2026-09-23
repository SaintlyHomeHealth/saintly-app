"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { saveQapiReview } from "@/lib/compliance/actions";
import { QAPI_COUNT_FIELDS, type QapiAutoKey } from "@/lib/compliance/constants";
import type { QapiLiveCounts } from "@/lib/compliance/status";
import type { QapiReviewRow } from "@/lib/compliance/types";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, SelectInput, SignatureFields, TextArea, TextInput } from "@/components/compliance/ui";

const AUTO = new Set<string>([
  "hospitalizations",
  "er_visits",
  "falls",
  "medication_errors",
  "complaints",
  "missed_visits",
  "infections",
]);

export function QapiReviewForm({
  row,
  year,
  quarter,
  signerName,
  today,
  live,
}: {
  row: QapiReviewRow | null;
  year: number;
  quarter: number;
  signerName: string;
  today: string;
  live: QapiLiveCounts;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = row?.status === "finalized";

  async function submit(intent: "draft" | "finalize") {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const data = new FormData(form);
    data.set("intent", intent);
    const result = await saveQapiReview(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  function fillFromLog() {
    const form = formRef.current;
    if (!form || locked) return;
    for (const key of Object.keys(live) as QapiAutoKey[]) {
      const input = form.elements.namedItem(key);
      if (input instanceof HTMLInputElement) input.value = String(live[key]);
    }
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-950">
        Hospitalizations, ER visits, falls, medication errors, complaints, missed visits, and infections start from the
        incident log. Change a number if the log is incomplete. Patients served and documentation items stay blank until
        you enter them.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Review date">
          <TextInput type="date" name="review_date" defaultValue={row?.review_date ?? today} disabled={locked} />
        </Field>
        <Field label="Reviewed by">
          <TextInput name="reviewed_by_name" defaultValue={row?.reviewed_by_name || signerName} disabled={locked} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QAPI_COUNT_FIELDS.map(([key, label]) => {
          const stored = row?.[key];
          const suggested = !row && AUTO.has(key) ? live[key as QapiAutoKey] : null;
          const value = stored == null ? (suggested == null ? "" : String(suggested)) : String(stored);
          return (
            <Field key={key} label={label}>
              <TextInput name={key} inputMode="numeric" defaultValue={value} disabled={locked} />
            </Field>
          );
        })}
      </div>
      <button type="button" className={saveButtonCls(false)} disabled={locked} onClick={fillFromLog}>
        Use incident log counts
      </button>
      <Field label="Trends or concerns identified">
        <TextArea name="trends" defaultValue={row?.trends ?? ""} disabled={locked} />
      </Field>
      <Field label="Corrective action / action plan">
        <TextArea name="action_plan" defaultValue={row?.action_plan ?? ""} disabled={locked} />
      </Field>
      <Field label="Was the previous corrective action effective?">
        <SelectInput name="previous_action_effective" defaultValue={row?.previous_action_effective ?? ""} disabled={locked}>
          <option value="">Choose</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="not_applicable">Not applicable</option>
        </SelectInput>
      </Field>
      <Field label="Additional notes">
        <TextArea name="additional_notes" defaultValue={row?.additional_notes ?? ""} disabled={locked} />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        <SignatureFields
          prefix="admin"
          label="Administrator signature"
          defaultName={row?.admin_signed_name || signerName}
          signedAt={row?.admin_signed_at}
          disabled={locked}
        />
        <SignatureFields
          prefix="clinical"
          label="Clinical Director / RN signature"
          optional
          defaultName={row?.clinical_signed_name || ""}
          signedAt={row?.clinical_signed_at}
          disabled={locked}
        />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={saveButtonCls(false)} disabled={pending || locked} onClick={() => submit("draft")}>
          Save Draft
        </button>
        <button type="button" className={saveButtonCls(true)} disabled={pending || locked} onClick={() => submit("finalize")}>
          Finalize
        </button>
        <PrintButton />
      </div>
    </form>
  );
}
