"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PlaybooksListResponse } from "@/app/api/facilities/playbooks/route";
import type { PlaybookCard, PlaybookStepRow } from "@/lib/crm/facility-playbook-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityPlaybooksViewProps = {
  canEdit: boolean;
};

const emptyStep = (): Partial<PlaybookStepRow> & { step_number: number; title: string } => ({
  step_number: 1,
  title: "",
  due_offset_days: 0,
});

export function FacilityPlaybooksView({ canEdit }: FacilityPlaybooksViewProps) {
  const [playbooks, setPlaybooks] = useState<PlaybookCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlaybookCard | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [facilityType, setFacilityType] = useState("");
  const [steps, setSteps] = useState<Array<Partial<PlaybookStepRow> & { step_number: number; title: string }>>([
    emptyStep(),
  ]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities/playbooks?include_steps=1");
      const data = (await res.json()) as PlaybooksListResponse;
      if (!data.ok) {
        setError("Could not load playbooks.");
        return;
      }
      setPlaybooks(data.playbooks);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setFacilityType("");
    setSteps([emptyStep()]);
    setEditorOpen(true);
  }

  function openEdit(pb: PlaybookCard) {
    setEditing(pb);
    setName(pb.name);
    setDescription(pb.description ?? "");
    setFacilityType(pb.facility_type ?? "");
    setSteps(
      pb.steps?.length
        ? pb.steps.map((s) => ({ ...s }))
        : [emptyStep()]
    );
    setEditorOpen(true);
  }

  async function savePlaybook() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        facility_type: facilityType || null,
        steps: steps
          .filter((s) => s.title.trim())
          .map((s, i) => ({
            step_number: s.step_number || i + 1,
            title: s.title,
            description: s.description ?? null,
            due_offset_days: s.due_offset_days ?? 0,
            suggested_activity_type: s.suggested_activity_type ?? null,
            suggested_outcome: s.suggested_outcome ?? null,
            suggested_follow_up_task: s.suggested_follow_up_task ?? null,
            requires_photo: Boolean(s.requires_photo),
            requires_contact_capture: Boolean(s.requires_contact_capture),
            requires_referral_process_capture: Boolean(s.requires_referral_process_capture),
          })),
      };

      const url = editing ? `/api/facilities/playbooks/${editing.id}` : "/api/facilities/playbooks";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!data.ok && !res.ok) {
        setError("Save failed.");
        return;
      }
      setEditorOpen(false);
      void load();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function archivePlaybook(id: string) {
    if (!confirm("Archive this playbook?")) return;
    await fetch(`/api/facilities/playbooks/${id}/archive`, { method: "POST" });
    void load();
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-[2.75rem] items-center rounded-xl border border-fuchsia-600 bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700"
          >
            + New Playbook
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading playbooks…</p>
      ) : playbooks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No playbooks yet. {canEdit ? "Create one to define a repeatable outreach sequence." : ""}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {playbooks.map((pb) => (
            <article key={pb.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">{pb.name}</h3>
              {pb.description ? <p className="mt-1 text-sm text-slate-600">{pb.description}</p> : null}
              <p className="mt-2 text-xs text-slate-500">
                {[pb.facility_type, `${pb.step_count} steps`, `${pb.active_campaign_count} active campaigns`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {pb.specialty_tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {pb.specialty_tags.map((t) => (
                    <span key={t} className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-800">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => openEdit(pb)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                ) : null}
                <Link
                  href={`/admin/facilities/campaigns?playbook_id=${pb.id}`}
                  className="rounded-lg border border-pink-600 bg-pink-50 px-3 py-1.5 text-xs font-semibold text-pink-900 hover:bg-pink-100"
                >
                  Start Campaign
                </Link>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void archivePlaybook(pb.id)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit Playbook" : "New Playbook"}</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={`${crmFilterInputCls} mt-1 w-full`}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Facility type
                <input
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  className={`${crmFilterInputCls} mt-1 w-full`}
                  placeholder="e.g. Podiatry"
                />
              </label>
            </div>

            <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Steps</h3>
            <div className="mt-2 space-y-3">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={step.title}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx] = { ...next[idx], title: e.target.value, step_number: idx + 1 };
                        setSteps(next);
                      }}
                      placeholder="Step title"
                      className={crmFilterInputCls}
                    />
                    <input
                      type="number"
                      value={step.due_offset_days ?? 0}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx] = { ...next[idx], due_offset_days: Number(e.target.value) };
                        setSteps(next);
                      }}
                      placeholder="Due offset days"
                      className={crmFilterInputCls}
                    />
                    <input
                      value={step.suggested_activity_type ?? ""}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx] = { ...next[idx], suggested_activity_type: e.target.value };
                        setSteps(next);
                      }}
                      placeholder="Suggested activity type"
                      className={crmFilterInputCls}
                    />
                    <input
                      value={step.suggested_outcome ?? ""}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx] = { ...next[idx], suggested_outcome: e.target.value };
                        setSteps(next);
                      }}
                      placeholder="Suggested outcome"
                      className={crmFilterInputCls}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSteps([...steps, { ...emptyStep(), step_number: steps.length + 1 }])}
              className="mt-2 text-xs font-semibold text-fuchsia-700 hover:underline"
            >
              + Add step
            </button>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={() => void savePlaybook()}
                className="rounded-xl border border-fuchsia-600 bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
