"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FacilityRadiusSelect,
  radiusValueToMiles,
  type FacilityRadiusValue,
} from "@/app/admin/facilities/_components/FacilityRadiusSelect";
import type { PtColdCallSearchResponse, PtColdCallSearchResult, PtColdCallTargetWithLatest } from "@/lib/recruiting/pt-cold-call-types";
import type { PtColdCallTargetsResponse } from "@/app/api/recruiting/pt-cold-calling/targets/route";
import {
  PT_COLD_CALL_FILTERS,
  PT_COLD_CALL_SEARCH_TYPES,
  getQuickActionById,
  type PtColdCallFilterId,
} from "@/lib/recruiting/pt-cold-call-options";
import { ptColdCallMatchesFilter } from "@/lib/recruiting/pt-cold-call-filters";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  PtColdCallConvertModal,
  PtColdCallContactModal,
  PtColdCallLogModal,
} from "./PtColdCallActionModals";
import {
  PtColdCallQuickAddModal,
  searchResultToQuickAddDraft,
  type QuickAddDraft,
} from "./PtColdCallQuickAddModal";
import { PtColdCallSavedCard } from "./PtColdCallSavedCard";
import {
  actionBtn,
  btnPrimary,
  btnSecondary,
  chipActive,
  chipIdle,
  formatShortDate,
  inputCls,
  selectCls,
  telHref,
  websiteHref,
} from "./pt-cold-call-shared";

const DASHBOARD_CARDS: { id: PtColdCallFilterId; label: string; tone: string }[] = [
  { id: "new", label: "New", tone: "from-slate-50 to-white text-slate-900 ring-slate-200" },
  { id: "call_today", label: "Call Today", tone: "from-amber-50 to-white text-amber-950 ring-amber-200" },
  { id: "follow_up_due", label: "Follow Up Due", tone: "from-orange-50 to-white text-orange-950 ring-orange-200" },
  { id: "interested", label: "Interested", tone: "from-sky-50 to-white text-sky-900 ring-sky-200" },
  { id: "candidate", label: "Candidate ID'd", tone: "from-emerald-50 to-white text-emerald-900 ring-emerald-200" },
  { id: "do_not_call", label: "Do Not Call", tone: "from-rose-50 to-white text-rose-900 ring-rose-200" },
];

function ResultMatchBadge({ status }: { status: PtColdCallSearchResult["match_status"] }) {
  if (status === "already_in_pipeline") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
        Already in PT Cold Calling
      </span>
    );
  }
  if (status === "possible_match") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-950 ring-1 ring-amber-200">
        Possible Match
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200">
      New Clinic
    </span>
  );
}

function ResultCard({
  item,
  savedTargetId,
  onQuickAdd,
  onOpenMatched,
}: {
  item: PtColdCallSearchResult;
  savedTargetId: string | null;
  onQuickAdd: () => void;
  onOpenMatched: (targetId: string) => void;
}) {
  const tel = telHref(item.phone);
  const site = websiteHref(item.website);
  const effectiveStatus = savedTargetId ? "already_in_pipeline" : item.match_status;
  const matchedId = savedTargetId ?? item.matched_target_id;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900">{item.clinic_name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ResultMatchBadge status={effectiveStatus} />
            {item.distance_miles != null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {item.distance_label}
              </span>
            ) : null}
            {item.google_rating != null ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                ★ {item.google_rating.toFixed(1)}
                {item.google_review_count != null ? ` (${item.google_review_count})` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-700">{item.formatted_address}</p>
      {item.phone ? <p className="mt-1 text-sm text-slate-700">{formatPhoneForDisplay(item.phone)}</p> : null}
      {site ? (
        <a href={site} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-sky-800 underline">
          {item.website}
        </a>
      ) : null}

      {effectiveStatus !== "new" && matchedId ? (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <p>
            <span className="font-semibold text-slate-500">Status:</span>{" "}
            {item.matched_status ?? "—"} · <span className="font-semibold text-slate-500">Last called:</span>{" "}
            {formatShortDate(item.matched_last_called_at)} ·{" "}
            <span className="font-semibold text-slate-500">Next:</span>{" "}
            {formatShortDate(item.matched_next_follow_up_at)}
          </p>
          {item.matched_latest_note ? (
            <p className="mt-1 line-clamp-2">
              <span className="font-semibold text-slate-500">Latest note:</span> {item.matched_latest_note}
            </p>
          ) : null}
          <p className="mt-1 text-slate-400">{item.match_reason}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {tel ? (
          <a href={tel} className={`${actionBtn} border-sky-300 bg-sky-50 text-sky-900`}>
            Call
          </a>
        ) : (
          <span className={`${actionBtn} cursor-not-allowed opacity-50`}>No phone</span>
        )}
        {site ? (
          <a href={site} target="_blank" rel="noreferrer" className={actionBtn}>
            Website
          </a>
        ) : null}
        <a href={item.google_maps_url} target="_blank" rel="noreferrer" className={actionBtn}>
          Maps
        </a>
        {effectiveStatus === "already_in_pipeline" && matchedId ? (
          <button type="button" onClick={() => onOpenMatched(matchedId)} className={`${actionBtn} border-emerald-300 bg-emerald-50 text-emerald-900`}>
            Open & add note
          </button>
        ) : effectiveStatus === "possible_match" && matchedId ? (
          <>
            <button type="button" onClick={() => onOpenMatched(matchedId)} className={`${actionBtn} border-amber-300 bg-amber-50 text-amber-900`}>
              Open existing
            </button>
            <button type="button" onClick={onQuickAdd} className={`${actionBtn} border-sky-300 bg-sky-50 text-sky-900`}>
              Add anyway
            </button>
          </>
        ) : (
          <button type="button" onClick={onQuickAdd} className={`${actionBtn} border-sky-300 bg-sky-50 text-sky-900`}>
            Quick Add
          </button>
        )}
      </div>
    </article>
  );
}

export function PtColdCallingView() {
  const [searchType, setSearchType] = useState<string>(PT_COLD_CALL_SEARCH_TYPES[0]);
  const [keyword, setKeyword] = useState("");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState<FacilityRadiusValue>(10);
  const [maxResults, setMaxResults] = useState(20);
  const [searching, setSearching] = useState(false);
  const [searchData, setSearchData] = useState<PtColdCallSearchResponse | null>(null);

  const [targetsData, setTargetsData] = useState<PtColdCallTargetsResponse | null>(null);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PtColdCallFilterId>("all");

  const [savedPlaceIds, setSavedPlaceIds] = useState<Record<string, string>>({});
  const [quickAddDraft, setQuickAddDraft] = useState<QuickAddDraft | null>(null);
  const [logTarget, setLogTarget] = useState<PtColdCallTargetWithLatest | null>(null);
  const [contactTarget, setContactTarget] = useState<PtColdCallTargetWithLatest | null>(null);
  const [convertTarget, setConvertTarget] = useState<PtColdCallTargetWithLatest | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadTargets = useCallback(async () => {
    setLoadingTargets(true);
    try {
      const res = await fetch("/api/recruiting/pt-cold-calling/targets", { cache: "no-store" });
      if (!res.ok) throw new Error("load_failed");
      setTargetsData((await res.json()) as PtColdCallTargetsResponse);
    } catch {
      setTargetsData((prev) => prev ?? { targets: [], counts: { new: 0, call_today: 0, follow_up_due: 0, interested: 0, candidate: 0, do_not_call: 0, bad_number: 0, not_interested: 0, all: 0 }, cutoff_iso: new Date().toISOString() });
    } finally {
      setLoadingTargets(false);
    }
  }, []);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const res = await fetch("/api/recruiting/pt-cold-calling/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          search_type: searchType,
          keyword: keyword.trim() || undefined,
          zip_code: zip.trim() || undefined,
          radius_miles: radiusValueToMiles(radius),
          max_results: maxResults,
        }),
      });
      if (!res.ok) throw new Error("search_failed");
      setSearchData((await res.json()) as PtColdCallSearchResponse);
    } catch {
      setSearchData({
        results: [],
        google_places_configured: true,
        normalized_query: { search_type: searchType, zip_code: zip.trim() || null, radius_miles: radiusValueToMiles(radius) },
        errors: ["Network error. Check your connection and try again."],
      });
    } finally {
      setSearching(false);
    }
  }, [searchType, keyword, zip, radius, maxResults]);

  function handleQuickAddSaved(placeId: string, targetId: string, name: string) {
    setSavedPlaceIds((prev) => ({ ...prev, [placeId]: targetId }));
    setQuickAddDraft(null);
    showToast(`${name} added to PT Cold Calling`);
    void loadTargets();
  }

  function openMatchedTarget(targetId: string) {
    const found = targetsData?.targets.find((t) => t.id === targetId);
    if (found) {
      setLogTarget(found);
    } else {
      showToast("Loading saved record…");
      void loadTargets();
    }
  }

  const handleQuickAction = useCallback(
    async (targetId: string, actionId: string) => {
      const action = getQuickActionById(actionId);
      if (!action) return;
      try {
        const res = await fetch(`/api/recruiting/pt-cold-calling/targets/${targetId}/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action.status,
            call_outcome: action.outcome ?? null,
            counts_as_call: action.countsAsCall,
            do_not_call: action.doNotCall ? true : null,
          }),
        });
        if (!res.ok) throw new Error("action_failed");
        showToast(`Updated: ${action.label}`);
        await loadTargets();
      } catch {
        showToast("Could not update. Try again.");
      }
    },
    [loadTargets, showToast]
  );

  const counts = targetsData?.counts ?? null;
  const cutoff = targetsData?.cutoff_iso ?? new Date().toISOString();

  const filteredTargets = useMemo(() => {
    const list = targetsData?.targets ?? [];
    if (activeFilter === "all") return list;
    return list.filter((t) => ptColdCallMatchesFilter(t, activeFilter, cutoff));
  }, [targetsData, activeFilter, cutoff]);

  const googleWarning =
    searchData && !searchData.google_places_configured
      ? "Google Places is not configured. Ask an admin to set GOOGLE_PLACES_API_KEY."
      : null;

  return (
    <div className="space-y-5 pb-24">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      {/* Dashboard cards */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {DASHBOARD_CARDS.map((card) => {
          const value = counts ? counts[card.id as keyof typeof counts] : 0;
          const active = activeFilter === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveFilter(active ? "all" : card.id)}
              className={`rounded-2xl bg-gradient-to-br p-3 text-left ring-1 transition active:scale-[0.98] ${card.tone} ${
                active ? "ring-2 ring-offset-1" : ""
              }`}
            >
              <span className="block text-xl font-bold leading-none">{value}</span>
              <span className="mt-1 block text-[11px] font-semibold">{card.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search panel */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Find clinics to call</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            ZIP code
            <input
              inputMode="numeric"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="85284"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Search type
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)} className={`${inputCls} mt-1`}>
              {PT_COLD_CALL_SEARCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium text-slate-600">
          Extra keyword (optional)
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. pediatric, hand therapy"
            className={`${inputCls} mt-1`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Radius</span>
          <FacilityRadiusSelect value={radius} onChange={setRadius} className={selectCls} />
          <select value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} className={selectCls}>
            <option value={10}>10 results</option>
            <option value={20}>20 results</option>
            <option value={40}>40 results</option>
          </select>
          <button type="button" onClick={() => void runSearch()} disabled={searching} className={`${btnPrimary} ml-auto`}>
            {searching ? "Searching…" : "Search Clinics"}
          </button>
        </div>
      </section>

      {googleWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{googleWarning}</div>
      ) : null}

      {searchData?.errors.map((err) => (
        <div key={err} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {err}
        </div>
      ))}

      {/* Search results */}
      {searching && !searchData ? <p className="py-6 text-center text-sm text-slate-500">Searching clinics…</p> : null}

      {searchData && searchData.results.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Google Places results ({searchData.results.length})
          </h2>
          {searchData.results.map((item) => (
            <ResultCard
              key={item.google_place_id}
              item={item}
              savedTargetId={savedPlaceIds[item.google_place_id] ?? null}
              onQuickAdd={() => setQuickAddDraft(searchResultToQuickAddDraft(item))}
              onOpenMatched={openMatchedTarget}
            />
          ))}
        </section>
      ) : null}

      {/* Saved list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Saved PT Cold Calling ({filteredTargets.length})
          </h2>
          <button type="button" onClick={() => void loadTargets()} className={btnSecondary}>
            Refresh
          </button>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {PT_COLD_CALL_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              className={activeFilter === f.id ? chipActive : chipIdle}
            >
              {f.label}
              {counts && f.id !== "all" ? (
                <span className="ml-1 opacity-70">{counts[f.id as keyof typeof counts] ?? 0}</span>
              ) : null}
            </button>
          ))}
        </div>

        {loadingTargets && !targetsData ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading saved records…</p>
        ) : filteredTargets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              {activeFilter === "all" ? "No call targets yet" : "Nothing in this filter"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Search clinics above and use Quick Add to start your call list.
            </p>
          </div>
        ) : (
          filteredTargets.map((t) => (
            <PtColdCallSavedCard
              key={t.id}
              target={t}
              onQuickAction={handleQuickAction}
              onAddNote={setLogTarget}
              onScheduleFollowUp={setLogTarget}
              onEditContact={setContactTarget}
              onConvert={setConvertTarget}
            />
          ))
        )}
      </section>

      {quickAddDraft ? (
        <PtColdCallQuickAddModal
          draft={quickAddDraft}
          onClose={() => setQuickAddDraft(null)}
          onSaved={(targetId, name) => handleQuickAddSaved(quickAddDraft.google_place_id, targetId, name)}
          onOpenExisting={(targetId) => {
            setQuickAddDraft(null);
            openMatchedTarget(targetId);
          }}
        />
      ) : null}

      {logTarget ? (
        <PtColdCallLogModal
          target={logTarget}
          onClose={() => setLogTarget(null)}
          onSaved={() => {
            setLogTarget(null);
            showToast("Call logged");
            void loadTargets();
          }}
        />
      ) : null}

      {contactTarget ? (
        <PtColdCallContactModal
          target={contactTarget}
          onClose={() => setContactTarget(null)}
          onSaved={() => {
            setContactTarget(null);
            showToast("Contact updated");
            void loadTargets();
          }}
        />
      ) : null}

      {convertTarget ? (
        <PtColdCallConvertModal
          target={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={() => {
            setConvertTarget(null);
            showToast("Recruiting candidate created");
            void loadTargets();
          }}
        />
      ) : null}
    </div>
  );
}
