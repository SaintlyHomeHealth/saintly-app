"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteDraftMeeting, saveMeeting } from "@/lib/compliance/actions";
import { MEETING_TYPES } from "@/lib/compliance/constants";
import { complianceHref } from "@/lib/compliance/period";
import type { MeetingRow } from "@/lib/compliance/types";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, SelectInput, SignatureFields, TextArea, TextInput, timeInputValue } from "@/components/compliance/ui";

export function MeetingForm({
  meeting,
  year,
  quarter,
  signerName,
}: {
  meeting: MeetingRow | null;
  year: number;
  quarter: number;
  signerName: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = meeting?.status === "finalized";

  async function submit(intent: "draft" | "finalize") {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const data = new FormData(form);
    data.set("intent", intent);
    const result = await saveMeeting(data);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!meeting && result.id) {
      router.push(`/admin/compliance/meetings/${result.id}`);
      return;
    }
    router.refresh();
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
      <input type="hidden" name="id" value={meeting?.id ?? ""} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meeting type">
          <SelectInput name="meeting_type" defaultValue={meeting?.meeting_type ?? "staff"} disabled={locked}>
            {MEETING_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Meeting date">
          <TextInput type="date" name="meeting_date" defaultValue={meeting?.meeting_date ?? ""} disabled={locked} />
        </Field>
        <Field label="Start time">
          <TextInput type="time" name="start_time" defaultValue={timeInputValue(meeting?.start_time)} disabled={locked} />
        </Field>
        <Field label="End time">
          <TextInput type="time" name="end_time" defaultValue={timeInputValue(meeting?.end_time)} disabled={locked} />
        </Field>
      </div>
      <Field label="Attendees">
        <TextArea name="attendees" defaultValue={meeting?.attendees ?? ""} disabled={locked} />
      </Field>
      <Field label="Topics discussed">
        <TextArea name="topics_discussed" defaultValue={meeting?.topics_discussed ?? ""} disabled={locked} />
      </Field>
      <Field label="Problems / concerns identified">
        <TextArea name="problems_identified" defaultValue={meeting?.problems_identified ?? ""} disabled={locked} />
      </Field>
      <Field label="Actions decided">
        <TextArea name="actions_decided" defaultValue={meeting?.actions_decided ?? ""} disabled={locked} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Person responsible">
          <TextInput name="person_responsible" defaultValue={meeting?.person_responsible ?? ""} disabled={locked} />
        </Field>
        <Field label="Due date">
          <TextInput type="date" name="due_date" defaultValue={meeting?.due_date ?? ""} disabled={locked} />
        </Field>
      </div>
      <Field label="Follow-up from prior meeting">
        <TextArea name="follow_up_prior" defaultValue={meeting?.follow_up_prior ?? ""} disabled={locked} />
      </Field>
      <Field label="Additional notes">
        <TextArea name="additional_notes" defaultValue={meeting?.additional_notes ?? ""} disabled={locked} />
      </Field>
      <div className="grid gap-4 lg:grid-cols-2">
        <SignatureFields
          prefix="admin"
          label="Administrator signature"
          defaultName={meeting?.admin_signed_name || signerName}
          signedAt={meeting?.admin_signed_at}
          disabled={locked}
        />
        <SignatureFields
          prefix="clinical"
          label="Clinical Director / RN signature"
          optional
          defaultName={meeting?.clinical_signed_name || ""}
          signedAt={meeting?.clinical_signed_at}
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
        {meeting?.status === "draft" ? (
          <button
            type="button"
            className={saveButtonCls(false)}
            disabled={pending}
            onClick={async () => {
              if (!window.confirm("Delete this draft?")) return;
              const result = await deleteDraftMeeting(meeting.id);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push(complianceHref("/admin/compliance/meetings", year, quarter));
            }}
          >
            Delete draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
