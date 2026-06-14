"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { MoveToPatientStageButton } from "@/app/admin/crm/leads/_components/MoveToPatientStageButton";
import type { AdmissionHandoffDetail } from "@/lib/crm/lead-admission-handoff-types";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";

const inp =
  "mt-0.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 shadow-sm";

export function AdmissionHandoffDetailView(props: {
  admissionId: string;
  initial: AdmissionHandoffDetail;
}) {
  const { admissionId, initial } = props;
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aloraCopy, setAloraCopy] = useState<string | null>(initial.alora_summary_text);
  const [showAloraCopy, setShowAloraCopy] = useState(false);

  const h = detail.handoff;
  const canEdit = detail.can_edit;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/intake/admissions/${encodeURIComponent(admissionId)}`);
    const data = (await res.json()) as AdmissionHandoffDetail & { ok?: boolean };
    if (data.ok !== false && data.handoff) setDetail(data as AdmissionHandoffDetail);
    router.refresh();
  }, [admissionId, router]);

  async function patch(body: Record<string, unknown>) {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/admissions/${encodeURIComponent(admissionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      await reload();
    } finally {
      setActing(false);
    }
  }

  async function action(path: string, body?: Record<string, unknown>) {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/intake/admissions/${encodeURIComponent(admissionId)}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      await reload();
    } finally {
      setActing(false);
    }
  }

  async function updateChecklistItem(itemId: string, status: string) {
    setActing(true);
    try {
      await fetch(
        `/api/intake/admissions/${encodeURIComponent(admissionId)}/checklist/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      await reload();
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{detail.patient_name}</h1>
          <p className="text-sm text-slate-600">
            {detail.facility_name ?? "No facility"} · Status: {h.status.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/crm/leads/${h.lead_id}#section-admission-handoff`}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
          >
            Open Lead
          </Link>
          {h.referring_facility_id ? (
            <Link
              href={`/admin/facilities/${h.referring_facility_id}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
            >
              Open Facility
            </Link>
          ) : null}
          <Link
            href={`/admin/crm/leads/${h.lead_id}#section-referral-documents`}
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900"
          >
            Documents ({detail.document_count})
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Summary</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Payer" value={h.payer_name ?? "—"} />
          <Field label="Payer status" value={h.payer_status ?? "—"} />
          <Field label="Priority" value={h.admission_priority} />
          <Field label="Services" value={h.requested_services?.join(", ") ?? "—"} />
          <Field label="Primary discipline" value={h.primary_discipline ?? "—"} />
          <Field label="Intake owner" value={detail.intake_owner_label ?? "—"} />
        </dl>
      </section>

      <section className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
        <h2 className="text-sm font-semibold text-indigo-950">SOC Planning</h2>
        {canEdit ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Target SOC date
              <input
                type="date"
                className={inp}
                defaultValue={h.target_soc_date ?? ""}
                onBlur={(e) => void patch({ target_soc_date: e.target.value || null })}
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Scheduled SOC
              <input
                type="datetime-local"
                className={inp}
                defaultValue={h.scheduled_soc_at ? h.scheduled_soc_at.slice(0, 16) : ""}
                onBlur={(e) =>
                  void patch({
                    scheduled_soc_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    soc_status: e.target.value ? "scheduled" : h.soc_status,
                  })
                }
              />
            </label>
            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              Assigned clinician
              <input
                type="text"
                className={inp}
                defaultValue={h.assigned_clinician_name ?? ""}
                onBlur={(e) => void patch({ assigned_clinician_name: e.target.value.trim() || null })}
              />
            </label>
          </div>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Field label="Target SOC" value={h.target_soc_date ? formatFacilityDate(h.target_soc_date) : "—"} />
            <Field
              label="Scheduled SOC"
              value={h.scheduled_soc_at ? formatFacilityDateTime(h.scheduled_soc_at) : "—"}
            />
            <Field label="Clinician" value={h.assigned_clinician_name ?? "—"} />
            <Field label="SOC status" value={h.soc_status ?? "—"} />
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Payer / Auth</h2>
        {canEdit ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Payer status
              <select
                className={inp}
                defaultValue={h.payer_status ?? "unknown"}
                onChange={(e) => void patch({ payer_status: e.target.value })}
              >
                {["unknown", "needs_verification", "verified", "not_accepted", "auth_required", "auth_pending", "auth_approved", "auth_denied"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, " ")}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Auth status
              <select
                className={inp}
                defaultValue={h.auth_status ?? "unknown"}
                onChange={(e) => void patch({ auth_status: e.target.value })}
              >
                {["not_required", "unknown", "required", "pending", "approved", "denied"].map((v) => (
                  <option key={v} value={v}>
                    {v.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                defaultChecked={h.benefits_verified}
                onChange={(e) => void patch({ benefits_verified: e.target.checked })}
              />
              Benefits verified
            </label>
          </div>
        ) : (
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Field label="Payer status" value={h.payer_status ?? "—"} />
            <Field label="Auth status" value={h.auth_status ?? "—"} />
            <Field label="Benefits verified" value={h.benefits_verified ? "Yes" : "No"} />
          </dl>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Documents / Orders</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Documents" value={h.documents_status ?? "—"} />
          <Field label="Physician order" value={h.physician_order_status ?? "—"} />
          <Field label="F2F" value={h.f2f_status ?? "—"} />
          <Field label="Needs review" value={String(detail.documents_needing_review)} />
        </dl>
        {detail.ai_summary_available ? (
          <p className="mt-2 text-xs text-violet-800">AI suggested info available on lead documents.</p>
        ) : null}
        {h.missing_items?.length ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {h.missing_items.map((m) => (
              <li key={m} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                {m}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Alora Handoff</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Alora status" value={h.alora_status ?? "not_started"} />
          <Field label="Alora patient ID" value={h.alora_patient_id ?? "—"} />
          <Field
            label="Entered"
            value={h.alora_entered_at ? formatFacilityDateTime(h.alora_entered_at) : "—"}
          />
        </dl>
        {canEdit ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={acting}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => {
                const id = window.prompt("Alora patient ID (optional):") ?? "";
                void action("mark-alora-entered", { alora_patient_id: id.trim() || null });
              }}
            >
              Mark Entered in Alora
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
              onClick={() => {
                setAloraCopy(detail.alora_summary_text);
                setShowAloraCopy(true);
              }}
            >
              Copy Alora Intake Summary
            </button>
          </div>
        ) : null}
        {showAloraCopy && aloraCopy ? (
          <textarea readOnly className={`${inp} mt-3 font-mono text-xs`} rows={12} value={aloraCopy} />
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Checklist</h2>
        <ul className="mt-3 space-y-2">
          {detail.checklist.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>{item.label}</span>
              {canEdit ? (
                <select
                  className="rounded border border-slate-200 px-2 py-1 text-xs"
                  value={item.status}
                  onChange={(e) => void updateChecklistItem(item.id, e.target.value)}
                  disabled={acting}
                >
                  {["pending", "complete", "not_required", "blocked"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs capitalize text-slate-600">{item.status.replace(/_/g, " ")}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canEdit ? (
        <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
          <h2 className="text-sm font-semibold text-emerald-950">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionBtn disabled={acting} onClick={() => void action("ready-for-soc")}>
              Mark Ready for SOC
            </ActionBtn>
            <ActionBtn
              disabled={acting}
              onClick={() => {
                const dt = window.prompt("Scheduled SOC (ISO datetime or leave blank for now):");
                if (dt === null) return;
                void action("schedule-soc", {
                  scheduled_soc_at: dt.trim() ? new Date(dt).toISOString() : new Date().toISOString(),
                });
              }}
            >
              Mark SOC Scheduled
            </ActionBtn>
            <ActionBtn disabled={acting} onClick={() => void action("mark-admitted")}>
              Mark Admitted
            </ActionBtn>
            <ActionBtn disabled={acting} onClick={() => void action("hold")}>
              Put On Hold
            </ActionBtn>
            <ActionBtn disabled={acting} onClick={() => void action("cancel")}>
              Cancel Handoff
            </ActionBtn>
            {!h.patient_id ? <MoveToPatientStageButton leadId={h.lead_id} /> : null}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Convert to patient uses the existing CRM conversion flow. Refresh this page after conversion to link the
            patient record.
          </p>
        </section>
      ) : (
        <p className="text-xs text-slate-500">View only — intake edits require manager access.</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 capitalize text-slate-800">{value}</dd>
    </div>
  );
}

function ActionBtn(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}
