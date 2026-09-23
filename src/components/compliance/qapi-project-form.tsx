"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addQapiProjectUpdate, completeQapiProject, reopenQapiProject, saveQapiProject } from "@/lib/compliance/actions";
import { PROJECT_STATUSES } from "@/lib/compliance/constants";
import type { ProjectRow, ProjectUpdateRow } from "@/lib/compliance/types";
import { formatAppDate } from "@/lib/datetime/app-timezone";
import { FormError, PrintButton, saveButtonCls } from "@/components/compliance/record-actions";
import { Field, SelectInput, TextArea, TextInput } from "@/components/compliance/ui";

export function QapiProjectForm({
  project,
  updates,
  today,
  canReopen,
}: {
  project: ProjectRow | null;
  updates: ProjectUpdateRow[];
  today: string;
  canReopen: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const updateRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = project?.status === "completed";

  async function save() {
    const form = formRef.current;
    if (!form) return;
    setPending(true);
    setError(null);
    const result = await saveQapiProject(new FormData(form));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!project && result.id) {
      router.push(`/admin/compliance/qapi/project/${result.id}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
        <input type="hidden" name="id" value={project?.id ?? ""} />
        <Field label="Project name">
          <TextInput
            name="project_name"
            defaultValue={project?.project_name ?? ""}
            placeholder="Example: Reduce unsigned 485s"
            disabled={locked}
          />
        </Field>
        <Field label="Problem identified">
          <TextArea
            name="problem_identified"
            defaultValue={project?.problem_identified ?? ""}
            placeholder="Example: Physician signatures are not being returned timely."
            disabled={locked}
          />
        </Field>
        <Field label="Reason project was selected">
          <TextArea name="reason_selected" defaultValue={project?.reason_selected ?? ""} disabled={locked} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Baseline">
            <TextInput name="baseline" defaultValue={project?.baseline ?? ""} disabled={locked} />
          </Field>
          <Field label="Goal">
            <TextInput
              name="goal"
              defaultValue={project?.goal ?? ""}
              placeholder="Example: Reduce outstanding unsigned 485s and follow up every 7 days."
              disabled={locked}
            />
          </Field>
        </div>
        <Field label="Action / intervention">
          <TextArea name="action_intervention" defaultValue={project?.action_intervention ?? ""} disabled={locked} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Responsible person">
            <TextInput name="responsible_person" defaultValue={project?.responsible_person ?? ""} disabled={locked} />
          </Field>
          <Field label="Start date">
            <TextInput type="date" name="start_date" defaultValue={project?.start_date ?? today} disabled={locked} />
          </Field>
          <Field label="Target date">
            <TextInput type="date" name="target_date" defaultValue={project?.target_date ?? ""} disabled={locked} />
          </Field>
        </div>
        <Field label="Current results">
          <TextArea name="current_results" defaultValue={project?.current_results ?? ""} disabled={locked} />
        </Field>
        <Field label="Status">
          <SelectInput name="status" defaultValue={project?.status ?? "planning"} disabled={locked}>
            {PROJECT_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Outcome">
          <TextArea name="outcome" defaultValue={project?.outcome ?? ""} disabled={locked} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Was goal met?">
            <SelectInput name="goal_met" defaultValue={project?.goal_met ?? ""} disabled={locked}>
              <option value="">Not yet</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="partially">Partially</option>
            </SelectInput>
          </Field>
          <Field label="Follow-up needed">
            <TextInput name="follow_up_needed" defaultValue={project?.follow_up_needed ?? ""} disabled={locked} />
          </Field>
        </div>
        <FormError message={error} />
        <div className="flex flex-wrap gap-3">
          <button type="button" className={saveButtonCls(true)} disabled={pending || locked} onClick={save}>
            Save
          </button>
          <PrintButton label="Print Project" />
          {project && !locked ? (
            <button
              type="button"
              className={saveButtonCls(false)}
              disabled={pending}
              onClick={async () => {
                if (!window.confirm("Mark this project completed?")) return;
                const result = await completeQapiProject(project.id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              }}
            >
              Complete Project
            </button>
          ) : null}
          {project && locked && canReopen ? (
            <button
              type="button"
              className={saveButtonCls(false)}
              disabled={pending}
              onClick={async () => {
                const result = await reopenQapiProject(project.id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              }}
            >
              Reopen
            </button>
          ) : null}
        </div>
      </form>

      {project ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Updates</h2>
          {updates.length === 0 ? <p className="text-sm text-slate-600">No updates yet.</p> : null}
          <ol className="space-y-3">
            {updates.map((update) => (
              <li key={update.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-sm font-bold text-slate-900">
                  {formatAppDate(`${update.update_date}T12:00:00-07:00`)} · {update.entered_by_name || "Staff"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{update.update_text}</p>
                {update.result ? <p className="mt-1 text-sm text-slate-600">Result: {update.result}</p> : null}
              </li>
            ))}
          </ol>
          {locked ? null : (
            <form
              ref={updateRef}
              className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError(null);
                const result = await addQapiProjectUpdate(new FormData(event.currentTarget));
                setPending(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                event.currentTarget.reset();
                router.refresh();
              }}
            >
              <input type="hidden" name="project_id" value={project.id} />
              <h3 className="font-bold text-slate-900">Add update</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date">
                  <TextInput type="date" name="update_date" defaultValue={today} required />
                </Field>
                <Field label="Result">
                  <TextInput name="result" />
                </Field>
              </div>
              <Field label="Update">
                <TextArea name="update_text" required />
              </Field>
              <button type="submit" className={saveButtonCls(true)} disabled={pending}>
                Add Update
              </button>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
}
