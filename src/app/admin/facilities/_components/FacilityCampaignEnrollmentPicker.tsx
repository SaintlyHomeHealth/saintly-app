"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type {
  BulkEnrollResult,
  CampaignCandidateFacility,
  FacilitySegmentRow,
} from "@/lib/crm/facility-playbook-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FilterState = {
  search: string;
  city: string;
  facility_type: string;
  specialty: string;
  priority: string;
  assigned_rep_id: string;
  relationship_status: string;
  source: string;
  last_visit: string;
  not_visited: boolean;
  follow_up_status: string;
  referral_potential: string;
  has_referrals: string;
  enrollment_status: string;
  no_active_campaign: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  city: "",
  facility_type: "",
  specialty: "",
  priority: "",
  assigned_rep_id: "",
  relationship_status: "",
  source: "",
  last_visit: "",
  not_visited: false,
  follow_up_status: "",
  referral_potential: "",
  has_referrals: "",
  enrollment_status: "not_enrolled",
  no_active_campaign: false,
};

const PRESETS: Array<{ id: string; label: string; patch: Partial<FilterState> }> = [
  { id: "not_visited", label: "Not visited yet", patch: { not_visited: true, last_visit: "never" } },
  { id: "due_followup", label: "Due for follow-up", patch: { follow_up_status: "due" } },
  { id: "overdue_followup", label: "Overdue follow-up", patch: { follow_up_status: "overdue" } },
  { id: "warm_hot", label: "Warm / Hot", patch: { referral_potential: "warm_hot" } },
  { id: "no_referral", label: "No referral yet", patch: { has_referrals: "no" } },
  { id: "google", label: "Google imported", patch: { source: "google_places" } },
  { id: "high_priority", label: "High priority", patch: { priority: "High" } },
  { id: "no_campaign", label: "No active campaign", patch: { no_active_campaign: true, enrollment_status: "not_enrolled" } },
  { id: "podiatry", label: "Podiatry", patch: { facility_type: "Podiatry", specialty: "Podiatry" } },
  { id: "wound_care", label: "Wound care", patch: { specialty: "Wound" } },
  { id: "assisted_living", label: "Assisted living", patch: { facility_type: "Assisted Living" } },
];

function filtersToQuery(f: FilterState, offset: number): string {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.city.trim()) p.set("city", f.city.trim());
  if (f.facility_type.trim()) p.set("facility_type", f.facility_type.trim());
  if (f.specialty.trim()) p.set("specialty", f.specialty.trim());
  if (f.priority) p.set("priority", f.priority);
  if (f.assigned_rep_id) p.set("assigned_rep_id", f.assigned_rep_id);
  if (f.relationship_status) p.set("relationship_status", f.relationship_status);
  if (f.source) p.set("source", f.source);
  if (f.last_visit) p.set("last_visit", f.last_visit);
  if (f.not_visited) p.set("not_visited", "1");
  if (f.follow_up_status) p.set("follow_up_status", f.follow_up_status);
  if (f.referral_potential) p.set("referral_potential", f.referral_potential);
  if (f.has_referrals) p.set("has_referrals", f.has_referrals);
  if (f.enrollment_status) p.set("enrollment_status", f.enrollment_status);
  if (f.no_active_campaign) p.set("no_active_campaign", "1");
  p.set("limit", "50");
  p.set("offset", String(offset));
  return p.toString();
}

function enrollmentBadge(f: CampaignCandidateFacility) {
  if (f.enrollment_status === "enrolled_this") {
    return <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-900">Enrolled</span>;
  }
  if (f.enrollment_status === "enrolled_other") {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
        In {f.other_campaign_name ?? "campaign"}
      </span>
    );
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Not enrolled</span>;
}

export type FacilityCampaignEnrollmentPickerProps = {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  staffOptions?: StaffOption[];
  defaultSelectedIds?: string[];
  onEnrolled?: (result: BulkEnrollResult) => void;
};

export function FacilityCampaignEnrollmentPicker({
  open,
  onClose,
  campaignId,
  campaignName,
  staffOptions = [],
  defaultSelectedIds = [],
  onEnrolled,
}: FacilityCampaignEnrollmentPickerProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [facilities, setFacilities] = useState<CampaignCandidateFacility[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [largeConfirmOpen, setLargeConfirmOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [segments, setSegments] = useState<FacilitySegmentRow[]>([]);
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [segmentName, setSegmentName] = useState("");
  const [assignedRepOverride, setAssignedRepOverride] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => window.clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    if (!open) {
      setFilters(DEFAULT_FILTERS);
      setDebouncedSearch("");
      setFacilities([]);
      setTotal(0);
      setOffset(0);
      setSelected(new Set(defaultSelectedIds));
      setShowSelectedOnly(false);
      setError(null);
      setConfirmOpen(false);
      setLargeConfirmOpen(false);
      setSaveSegmentOpen(false);
      setSegmentName("");
      setAssignedRepOverride("");
      return;
    }
    setSelected(new Set(defaultSelectedIds));
    void fetch("/api/facilities/segments")
      .then((r) => r.json())
      .then((d: { ok: boolean; segments?: FacilitySegmentRow[] }) => {
        if (d.ok) setSegments(d.segments ?? []);
      })
      .catch(() => undefined);
  }, [open, defaultSelectedIds]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const q = filtersToQuery({ ...filters, search: debouncedSearch }, offset);
      const res = await fetch(`/api/facilities/campaigns/${campaignId}/candidate-facilities?${q}`);
      const data = (await res.json()) as {
        ok: boolean;
        facilities?: CampaignCandidateFacility[];
        total?: number;
        error?: string;
      };
      if (!data.ok) {
        setError("Could not load facilities.");
        setFacilities([]);
        return;
      }
      setFacilities(data.facilities ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [open, campaignId, filters, debouncedSearch, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleFacilities = useMemo(() => {
    if (!showSelectedOnly) return facilities;
    return facilities.filter((f) => selected.has(f.id));
  }, [facilities, showSelectedOnly, selected]);

  const selectableVisible = visibleFacilities.filter((f) => f.enrollment_status === "not_enrolled");
  const selectedCount = selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of selectableVisible) next.add(f.id);
      return next;
    });
  }

  function clearSelected() {
    setSelected(new Set());
  }

  function applyPreset(patch: Partial<FilterState>) {
    setFilters((prev) => ({ ...DEFAULT_FILTERS, ...patch, search: prev.search }));
    setOffset(0);
  }

  function loadSegment(seg: FacilitySegmentRow) {
    const fj = seg.filters_json as Partial<FilterState>;
    setFilters({ ...DEFAULT_FILTERS, ...fj });
    setOffset(0);
  }

  async function saveSegment() {
    if (!segmentName.trim()) return;
    const res = await fetch("/api/facilities/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: segmentName.trim(), filters_json: filters }),
    });
    const data = (await res.json()) as { ok?: boolean };
    if (data.ok) {
      setSaveSegmentOpen(false);
      setSegmentName("");
      const list = await fetch("/api/facilities/segments").then((r) => r.json());
      if (list.ok) setSegments(list.segments ?? []);
    }
  }

  function startEnroll() {
    if (selectedCount === 0) return;
    if (selectedCount >= 50) {
      setLargeConfirmOpen(true);
      return;
    }
    setConfirmOpen(true);
  }

  async function enrollConfirmed() {
    setConfirmOpen(false);
    setLargeConfirmOpen(false);
    setEnrolling(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/campaigns/${campaignId}/enroll-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_ids: [...selected],
          assigned_rep_id: assignedRepOverride || null,
          skip_existing: true,
        }),
      });
      const data = (await res.json()) as BulkEnrollResult & { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error === "campaign_closed" ? "Campaign is closed." : "Enrollment failed.");
        return;
      }
      onEnrolled?.(data);
      onClose();
    } catch {
      setError("Network error during enrollment.");
    } finally {
      setEnrolling(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[96vh] w-full max-w-6xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-pink-800">Add facilities</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{campaignName}</h2>
          <p className="mt-1 text-xs text-slate-600">Search, filter, and enroll facilities into this campaign.</p>
        </div>

        <div className="shrink-0 space-y-3 border-b border-slate-100 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.patch)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-pink-50 hover:border-pink-200"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="search"
              value={filters.search}
              onChange={(e) => {
                setFilters((f) => ({ ...f, search: e.target.value }));
                setOffset(0);
              }}
              placeholder="Name, phone, address, contact…"
              className={crmFilterInputCls}
            />
            <input
              value={filters.city}
              onChange={(e) => {
                setFilters((f) => ({ ...f, city: e.target.value }));
                setOffset(0);
              }}
              placeholder="City"
              className={crmFilterInputCls}
            />
            <input
              value={filters.facility_type}
              onChange={(e) => {
                setFilters((f) => ({ ...f, facility_type: e.target.value }));
                setOffset(0);
              }}
              placeholder="Facility type"
              className={crmFilterInputCls}
            />
            <select
              value={filters.priority}
              onChange={(e) => {
                setFilters((f) => ({ ...f, priority: e.target.value }));
                setOffset(0);
              }}
              className={crmFilterInputCls}
            >
              <option value="">Any priority</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={filters.assigned_rep_id}
              onChange={(e) => {
                setFilters((f) => ({ ...f, assigned_rep_id: e.target.value }));
                setOffset(0);
              }}
              className={crmFilterInputCls}
            >
              <option value="">Any rep</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={filters.enrollment_status}
              onChange={(e) => {
                setFilters((f) => ({ ...f, enrollment_status: e.target.value }));
                setOffset(0);
              }}
              className={crmFilterInputCls}
            >
              <option value="not_enrolled">Not enrolled (default)</option>
              <option value="already_enrolled">Already enrolled</option>
              <option value="all">All facilities</option>
            </select>
            <select
              value={filters.has_referrals}
              onChange={(e) => {
                setFilters((f) => ({ ...f, has_referrals: e.target.value }));
                setOffset(0);
              }}
              className={crmFilterInputCls}
            >
              <option value="">Any referrals</option>
              <option value="no">No referrals</option>
              <option value="yes">Has referrals</option>
            </select>
            <select
              value={filters.source}
              onChange={(e) => {
                setFilters((f) => ({ ...f, source: e.target.value }));
                setOffset(0);
              }}
              className={crmFilterInputCls}
            >
              <option value="">Any source</option>
              <option value="manual">Manual</option>
              <option value="google_places">Google Places</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {segments.length > 0 ? (
              <select
                className={`${crmFilterInputCls} max-w-[200px]`}
                defaultValue=""
                onChange={(e) => {
                  const seg = segments.find((s) => s.id === e.target.value);
                  if (seg) loadSegment(seg);
                  e.target.value = "";
                }}
              >
                <option value="">Load segment…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setSaveSegmentOpen(true)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save segment
            </button>
            <span className="text-xs text-slate-500">
              {total} match{total === 1 ? "" : "es"}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
            <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-xs font-bold text-pink-900">
              {selectedCount} selected
            </span>
            <button type="button" onClick={selectAllVisible} className="text-xs font-semibold text-sky-800 hover:underline">
              Select all visible
            </button>
            <button type="button" onClick={clearSelected} className="text-xs font-semibold text-slate-600 hover:underline">
              Clear
            </button>
            <button
              type="button"
              onClick={() => setShowSelectedOnly((v) => !v)}
              className="text-xs font-semibold text-slate-600 hover:underline"
            >
              {showSelectedOnly ? "Show all" : "Selected only"}
            </button>
            {staffOptions.length > 0 ? (
              <select
                value={assignedRepOverride}
                onChange={(e) => setAssignedRepOverride(e.target.value)}
                className={`${crmFilterInputCls} ml-auto max-w-[180px] text-xs`}
              >
                <option value="">Assign rep on enroll (optional)</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            {error ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading facilities…</p>
            ) : visibleFacilities.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No facilities match these filters.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2 pr-2">Select</th>
                        <th className="py-2 pr-2">Facility</th>
                        <th className="py-2 pr-2">City</th>
                        <th className="py-2 pr-2">Last visit</th>
                        <th className="py-2 pr-2">Follow-up</th>
                        <th className="py-2 pr-2">Priority</th>
                        <th className="py-2 pr-2">Rep</th>
                        <th className="py-2 pr-2">Referrals</th>
                        <th className="py-2 pr-2">Campaign</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFacilities.map((f) => {
                        const canSelect = f.enrollment_status === "not_enrolled";
                        return (
                          <tr key={f.id} className="border-b border-slate-50 align-top">
                            <td className="py-2 pr-2">
                              <input
                                type="checkbox"
                                checked={selected.has(f.id)}
                                disabled={!canSelect}
                                onChange={() => toggle(f.id)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <p className="font-semibold text-slate-900">{f.name}</p>
                              <p className="text-xs text-slate-500">{[f.type, f.address].filter(Boolean).join(" · ")}</p>
                            </td>
                            <td className="py-2 pr-2 text-xs">{f.city ?? "—"}</td>
                            <td className="py-2 pr-2 text-xs">{f.last_visit_at ? formatFacilityDate(f.last_visit_at) : "Never"}</td>
                            <td className="py-2 pr-2 text-xs">
                              {f.follow_up_status === "overdue" ? (
                                <span className="font-semibold text-rose-700">Overdue</span>
                              ) : f.follow_up_status === "due" ? (
                                <span className="font-semibold text-amber-800">Due</span>
                              ) : f.next_follow_up_at ? (
                                formatFacilityDate(f.next_follow_up_at)
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-2 pr-2 text-xs">{f.priority}</td>
                            <td className="py-2 pr-2 text-xs">{f.assigned_rep_label ?? "—"}</td>
                            <td className="py-2 pr-2 text-xs tabular-nums">{f.referral_count}</td>
                            <td className="py-2 pr-2">{enrollmentBadge(f)}</td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                <Link href={`/admin/facilities/${f.id}`} className="text-xs font-semibold text-sky-800 hover:underline">
                                  Open
                                </Link>
                                <FacilityQuickLogButton facilityId={f.id} facilityName={f.name} className="text-xs font-semibold text-slate-600 hover:underline">
                                  Quick Log
                                </FacilityQuickLogButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {visibleFacilities.map((f) => {
                    const canSelect = f.enrollment_status === "not_enrolled";
                    return (
                      <article key={f.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(f.id)}
                            disabled={!canSelect}
                            onChange={() => toggle(f.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900">{f.name}</p>
                            <p className="text-xs text-slate-600">{[f.type, f.city].filter(Boolean).join(" · ")}</p>
                            <p className="mt-1 text-xs text-slate-500">{f.address}</p>
                            <div className="mt-2 flex flex-wrap gap-1">{enrollmentBadge(f)}</div>
                            <p className="mt-1 text-xs text-slate-500">
                              Last visit: {f.last_visit_at ? formatFacilityDate(f.last_visit_at) : "Never"} · Referrals: {f.referral_count}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Link href={`/admin/facilities/${f.id}`} className="text-xs font-semibold text-sky-800">
                            Open
                          </Link>
                          <FacilityQuickLogButton facilityId={f.id} facilityName={f.name} className="text-xs font-semibold text-slate-600">
                            Quick Log
                          </FacilityQuickLogButton>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {total > offset + 50 ? (
            <div className="shrink-0 border-t border-slate-100 px-5 py-2 text-center">
              <button
                type="button"
                onClick={() => setOffset((o) => o + 50)}
                className="text-sm font-semibold text-sky-800 hover:underline"
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || enrolling}
            onClick={startEnroll}
            className="rounded-xl border border-pink-600 bg-pink-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enrolling ? "Enrolling…" : `Enroll selected (${selectedCount})`}
          </button>
        </div>
      </div>

      {confirmOpen || largeConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Confirm enrollment</h3>
            <p className="mt-2 text-sm text-slate-600">
              Enroll {selectedCount} facilit{selectedCount === 1 ? "y" : "ies"} into <strong>{campaignName}</strong>?
            </p>
            {largeConfirmOpen ? (
              <p className="mt-2 text-sm font-semibold text-amber-900">You are enrolling 50+ facilities. Continue?</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setLargeConfirmOpen(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void enrollConfirmed()}
                className="rounded-lg border border-pink-600 bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Enroll
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveSegmentOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="font-bold text-slate-900">Save segment</h3>
            <input
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              placeholder="Segment name"
              className={`${crmFilterInputCls} mt-3 w-full`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSaveSegmentOpen(false)} className="text-sm font-semibold text-slate-600">
                Cancel
              </button>
              <button type="button" onClick={() => void saveSegment()} className="text-sm font-semibold text-pink-800">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
