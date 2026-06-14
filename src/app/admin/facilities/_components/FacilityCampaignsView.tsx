"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { CampaignsListResponse } from "@/app/api/facilities/campaigns/route";
import type { PlaybooksListResponse } from "@/app/api/facilities/playbooks/route";
import type { CampaignCard } from "@/lib/crm/facility-playbook-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilityCampaignsViewProps = {
  canManage: boolean;
  staffOptions: StaffOption[];
};

export function FacilityCampaignsView({ canManage, staffOptions }: FacilityCampaignsViewProps) {
  const searchParams = useSearchParams();
  const presetPlaybookId = searchParams.get("playbook_id") ?? "";

  const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
  const [playbooks, setPlaybooks] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(Boolean(presetPlaybookId));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [playbookId, setPlaybookId] = useState(presetPlaybookId);
  const [repId, setRepId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/facilities/campaigns"),
        fetch("/api/facilities/playbooks"),
      ]);
      const cData = (await cRes.json()) as CampaignsListResponse;
      const pData = (await pRes.json()) as PlaybooksListResponse;
      if (!cData.ok) {
        setError("Could not load campaigns.");
        return;
      }
      setCampaigns(cData.campaigns);
      if (pData.ok) setPlaybooks(pData.playbooks.map((p) => ({ id: p.id, name: p.name })));
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign() {
    if (!name.trim() || !playbookId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/facilities/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          playbook_id: playbookId,
          assigned_rep_id: repId || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string };
      if (!data.ok || !data.id) {
        setError("Create failed.");
        return;
      }
      setCreateOpen(false);
      window.location.href = `/admin/facilities/campaigns/${data.id}`;
    } catch {
      setError("Create failed.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = useMemo(() => campaigns.filter((c) => c.status === "active").length, [campaigns]);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Total campaigns", value: campaigns.length },
          { label: "Active", value: activeCount },
          { label: "Facilities enrolled", value: campaigns.reduce((s, c) => s + c.facilities_enrolled, 0) },
          { label: "Overdue steps", value: campaigns.reduce((s, c) => s + c.steps_overdue, 0) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{loading ? "—" : s.value}</p>
          </div>
        ))}
      </section>

      {canManage ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-[2.75rem] items-center rounded-xl border border-pink-600 bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
          >
            + New Campaign
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-600">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No campaigns yet.
        </p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/admin/facilities/campaigns/${c.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-pink-200 hover:bg-pink-50/30"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {[c.playbook_name, c.assigned_rep_label, c.status].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs font-bold text-pink-900">
                  {c.progress_pct}% progress
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {c.facilities_enrolled} enrolled · {c.steps_completed} steps done · {c.steps_overdue} overdue
              </p>
            </Link>
          ))}
        </div>
      )}

      {createOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">New Campaign</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Playbook
                <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
                  <option value="">Select playbook</option>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Assigned rep
                <select value={repId} onChange={(e) => setRepId(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
                  <option value="">Default (facility rep)</option>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${crmFilterInputCls} mt-1 w-full`} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !name.trim() || !playbookId}
                onClick={() => void createCampaign()}
                className="rounded-xl border border-pink-600 bg-pink-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
