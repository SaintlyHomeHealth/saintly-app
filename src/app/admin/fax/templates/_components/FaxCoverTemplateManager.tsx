"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { faxUi } from "@/app/admin/fax/_components/fax-center-ui";
import type { FaxCoverSheetTemplateRow } from "@/lib/fax/fax-cover-template-types";

type Props = {
  initialTemplates: FaxCoverSheetTemplateRow[];
};

type EditorState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  default_subject: string;
  default_message: string;
};

export function FaxCoverTemplateManager({ initialTemplates }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  async function refresh() {
    const res = await fetch("/api/fax/cover-templates");
    const data = (await res.json()) as { templates?: FaxCoverSheetTemplateRow[]; error?: string };
    if (!res.ok) throw new Error(data.error || "Could not refresh templates.");
    setTemplates(data.templates ?? []);
  }

  async function apiPost(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`);
  }

  async function apiPatch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/fax/cover-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `Update failed (${res.status}).`);
  }

  async function apiDelete(id: string) {
    const res = await fetch(`/api/fax/cover-templates/${id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || `Delete failed (${res.status}).`);
  }

  function openCreate() {
    setEditor({ mode: "create", name: "", default_subject: "", default_message: "" });
    setError(null);
  }

  function openEdit(t: FaxCoverSheetTemplateRow) {
    setEditor({
      mode: "edit",
      id: t.id,
      name: t.name,
      default_subject: t.default_subject,
      default_message: t.default_message,
    });
    setError(null);
  }

  async function saveEditor() {
    if (!editor) return;
    if (!editor.name.trim()) {
      setError("Template name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editor.mode === "create") {
        await apiPost("/api/fax/cover-templates", {
          name: editor.name.trim(),
          default_subject: editor.default_subject.trim(),
          default_message: editor.default_message.trim(),
        });
      } else if (editor.id) {
        await apiPatch(editor.id, {
          name: editor.name.trim(),
          default_subject: editor.default_subject.trim(),
          default_message: editor.default_message.trim(),
        });
      }
      setEditor(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTemplate(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/fax/cover-templates/${id}/duplicate`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/fax/cover-templates/${id}/set-default`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set default.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(t: FaxCoverSheetTemplateRow) {
    if (t.is_system) return;
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(t.id);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className={`${faxUi.section} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Template library</h2>
          <p className={`${faxUi.sectionHint} mt-1`}>
            Starter templates cannot be deleted. Duplicate any template to customize a copy for your team.
          </p>
        </div>
        <button type="button" className={faxUi.btnPrimary} disabled={busy} onClick={openCreate}>
          Create template
        </button>
      </div>

      {error ? <div className={faxUi.alertError}>{error}</div> : null}

      {editor ? (
        <div className={faxUi.section}>
          <p className="text-sm font-bold text-slate-900">{editor.mode === "create" ? "New template" : "Edit template"}</p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={faxUi.label}>
                Name <span className={faxUi.required}>*</span>
              </span>
              <input
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                disabled={busy}
                className={faxUi.input}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={faxUi.label}>Default subject</span>
              <input
                value={editor.default_subject}
                onChange={(e) => setEditor({ ...editor, default_subject: e.target.value })}
                disabled={busy}
                className={faxUi.input}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={faxUi.label}>Default message</span>
              <textarea
                value={editor.default_message}
                onChange={(e) => setEditor({ ...editor, default_message: e.target.value })}
                disabled={busy}
                rows={5}
                className={faxUi.textarea}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={faxUi.btnGhost} disabled={busy} onClick={() => setEditor(null)}>
              Cancel
            </button>
            <button type="button" className={faxUi.btnPrimary} disabled={busy} onClick={() => void saveEditor()}>
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        </div>
      ) : null}

      <section className={faxUi.card}>
        <div className="min-w-[720px] divide-y divide-slate-100">
          <div className="grid grid-cols-[1fr_120px_200px] gap-3 bg-slate-50/80 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <div>Template</div>
            <div>Default</div>
            <div>Actions</div>
          </div>
          {templates.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">No templates yet.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_120px_200px] items-start gap-3 px-4 py-4 text-sm transition hover:bg-slate-50/50">
                <div>
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Subject: {t.default_subject || "—"}</p>
                  {t.is_system ? <span className={`${faxUi.pillMuted} mt-2`}>Starter</span> : null}
                </div>
                <div className="pt-0.5">
                  {t.is_default ? (
                    <span className={faxUi.pill}>Default</span>
                  ) : (
                    <button type="button" className={faxUi.btnGhost} disabled={busy} onClick={() => void setDefault(t.id)}>
                      Set default
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={faxUi.btnSecondary} disabled={busy} onClick={() => openEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className={faxUi.btnGhost} disabled={busy} onClick={() => void duplicateTemplate(t.id)}>
                    Duplicate
                  </button>
                  {!t.is_system ? (
                    <button type="button" className={faxUi.btnGhost} disabled={busy} onClick={() => void deleteTemplate(t)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        <Link href="/admin/fax" className="font-semibold text-sky-700 hover:underline">
          Return to Fax Center
        </Link>
        {" · "}
        Templates auto-fill subject and message in New Fax Packet.
      </p>
    </section>
  );
}
