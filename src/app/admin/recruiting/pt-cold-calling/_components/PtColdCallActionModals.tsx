"use client";

import { useState } from "react";

import type { AddCallLogResponse } from "@/app/api/recruiting/pt-cold-calling/targets/[targetId]/log/route";
import type { UpdateTargetResponse } from "@/app/api/recruiting/pt-cold-calling/targets/[targetId]/route";
import type { ConvertToCandidateResponse } from "@/app/api/recruiting/pt-cold-calling/targets/[targetId]/convert/route";
import {
  PT_COLD_CALL_DISCIPLINE_OPTIONS,
  PT_COLD_CALL_OUTCOMES,
  PT_COLD_CALL_STATUSES,
} from "@/lib/recruiting/pt-cold-call-options";
import type { PtColdCallTargetRow, PtColdCallTargetWithLatest } from "@/lib/recruiting/pt-cold-call-types";
import { inputCls, isoToYmd, ymdToFollowUpIso } from "./pt-cold-call-shared";

function ModalShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
        role="dialog"
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}

/** Add a call/note to an existing saved record (also used to schedule follow-ups). */
export function PtColdCallLogModal({
  target,
  onClose,
  onSaved,
}: {
  target: PtColdCallTargetWithLatest;
  onClose: () => void;
  onSaved: (updated: PtColdCallTargetRow) => void;
}) {
  const [status, setStatus] = useState<string>(target.status);
  const [person, setPerson] = useState(target.contact_person ?? "");
  const [title, setTitle] = useState(target.contact_title ?? "");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(isoToYmd(target.next_follow_up_at));
  const [followUpReason, setFollowUpReason] = useState(target.follow_up_reason ?? "");
  const [countsAsCall, setCountsAsCall] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting/pt-cold-calling/targets/${target.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: status || null,
          person_spoke_with: person.trim() || null,
          person_title: title.trim() || null,
          call_outcome: outcome.trim() || null,
          notes: notes.trim() || null,
          next_follow_up_at: followUp ? ymdToFollowUpIso(followUp) : null,
          follow_up_reason: followUpReason.trim() || null,
          do_not_call: status === "Do Not Call" ? true : null,
          counts_as_call: countsAsCall,
        }),
      });
      const data = (await res.json()) as AddCallLogResponse;
      if (data.ok) {
        onSaved(data.target);
        return;
      }
      setError(data.error === "save_failed" ? "Could not save. Try again." : data.error ?? "Save failed.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Log a Call / Note"
      subtitle={target.clinic_name}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-[2] rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <label className="block text-xs font-medium text-slate-600">
        Status
        <select className={`${inputCls} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {PT_COLD_CALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-600">
          Spoke with
          <input className={`${inputCls} mt-1`} value={person} onChange={(e) => setPerson(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Title / role
          <input className={`${inputCls} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-600">
        Call outcome
        <select className={`${inputCls} mt-1`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">No outcome</option>
          {PT_COLD_CALL_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Notes
        <textarea
          className={`${inputCls} mt-1 min-h-[3.5rem]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Call notes…"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-600">
          Follow-up date
          <input
            type="date"
            className={`${inputCls} mt-1`}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Follow-up reason
          <input
            className={`${inputCls} mt-1`}
            value={followUpReason}
            onChange={(e) => setFollowUpReason(e.target.value)}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={countsAsCall}
          onChange={(e) => setCountsAsCall(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-200"
        />
        Count as a call attempt (updates last called + attempts)
      </label>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
    </ModalShell>
  );
}

/** Edit the contact person / title on a saved record. */
export function PtColdCallContactModal({
  target,
  onClose,
  onSaved,
}: {
  target: PtColdCallTargetWithLatest;
  onClose: () => void;
  onSaved: (updated: PtColdCallTargetRow) => void;
}) {
  const [person, setPerson] = useState(target.contact_person ?? "");
  const [title, setTitle] = useState(target.contact_title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting/pt-cold-calling/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_person: person.trim() || null, contact_title: title.trim() || null }),
      });
      const data = (await res.json()) as UpdateTargetResponse;
      if (data.ok) {
        onSaved(data.target);
        return;
      }
      setError(data.error === "save_failed" ? "Could not save. Try again." : data.error ?? "Save failed.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Edit Contact Person"
      subtitle={target.clinic_name}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-[2] rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <label className="block text-xs font-medium text-slate-600">
        Contact person
        <input className={`${inputCls} mt-1`} value={person} onChange={(e) => setPerson(e.target.value)} />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Title / role
        <input className={`${inputCls} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
    </ModalShell>
  );
}

/** Convert a call target into a real recruiting candidate (employment lead). */
export function PtColdCallConvertModal({
  target,
  onClose,
  onConverted,
}: {
  target: PtColdCallTargetWithLatest;
  onClose: () => void;
  onConverted: (updated: PtColdCallTargetRow, candidateId: string) => void;
}) {
  const [name, setName] = useState(target.contact_person ?? "");
  const [phone, setPhone] = useState(target.phone ?? "");
  const [email, setEmail] = useState("");
  const [discipline, setDiscipline] = useState<string>("PT");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting/pt-cold-calling/targets/${target.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_name: name.trim(),
          candidate_phone: phone.trim() || null,
          candidate_email: email.trim() || null,
          discipline,
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json()) as ConvertToCandidateResponse;
      if (data.ok) {
        onConverted(data.target, data.candidate_id);
        return;
      }
      setError(
        data.error === "missing_name"
          ? "Enter the candidate's name."
          : data.error === "save_failed"
            ? "Could not create candidate. Try again."
            : data.error ?? "Save failed."
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title="Convert to Candidate"
      subtitle={`Create a recruiting lead from ${target.clinic_name}`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void save()}
            className="flex-[2] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Recruiting Lead"}
          </button>
        </>
      }
    >
      <label className="block text-xs font-medium text-slate-600">
        Candidate name
        <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-slate-600">
          Phone
          <input className={`${inputCls} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Discipline
          <select className={`${inputCls} mt-1`} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            {PT_COLD_CALL_DISCIPLINE_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs font-medium text-slate-600">
        Email
        <input className={`${inputCls} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Notes
        <textarea
          className={`${inputCls} mt-1 min-h-[3.5rem]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Availability, license, interest…"
        />
      </label>
      <p className="text-[11px] text-slate-500">
        Creates a real recruiting candidate and links it to this clinic. The clinic call history stays here.
      </p>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}
    </ModalShell>
  );
}
