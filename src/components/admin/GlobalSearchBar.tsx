"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatMatchedFieldLabel } from "@/lib/admin/global-search/source-trail";
import type { GlobalSearchResponse, GlobalSearchResult } from "@/lib/admin/global-search/types";
import { globalSearchTypeLabel } from "@/lib/admin/global-search/hrefs";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function GlobalSearchResultCard({
  result,
  compact = false,
}: {
  result: GlobalSearchResult;
  compact?: boolean;
}) {
  const matched = result.matchedFields.map(formatMatchedFieldLabel).join(" · ");

  return (
    <Link
      href={result.href}
      className={`block rounded-xl border border-slate-200/90 bg-white transition hover:border-sky-200 hover:bg-sky-50/40 hover:shadow-sm ${
        compact ? "px-3 py-2.5" : "px-4 py-3.5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{result.title}</span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
              {globalSearchTypeLabel(result.type)}
            </span>
          </div>
          <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 ${compact ? "hidden sm:flex" : ""}`}>
            {result.phone ? <span>{result.phone}</span> : null}
            {result.email ? <span>{result.email}</span> : null}
            {result.status ? <span className="capitalize">{result.status}</span> : null}
          </div>
        </div>
        {!compact ? (
          <span className="shrink-0 text-[11px] font-semibold text-sky-800">Open →</span>
        ) : null}
      </div>

      {result.sourceTrail.length > 0 ? (
        <div className={`mt-2 rounded-lg bg-slate-50 px-2.5 py-2 ${compact ? "text-[11px]" : "text-xs"}`}>
          <p className="font-semibold text-slate-700">Source trail</p>
          <p className="mt-0.5 text-slate-600">{result.sourceTrail.join(" → ")}</p>
        </div>
      ) : null}

      <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 ${compact ? "hidden md:flex" : ""}`}>
        {matched ? <span>{matched}</span> : null}
        {result.createdAt ? <span>Created {formatWhen(result.createdAt)}</span> : null}
        {result.lastActivityAt ? <span>Last activity {formatWhen(result.lastActivityAt)}</span> : null}
      </div>

      {result.type === "call" ? (
        <div className="mt-1 text-[11px] text-slate-500">
          {result.callDirection ? `${result.callDirection} call` : null}
          {result.callPartyNumber ? ` · ${result.callPartyNumber}` : null}
          {result.relatedEntityLabel ? ` · ${result.relatedEntityLabel}` : null}
        </div>
      ) : null}
    </Link>
  );
}

function GlobalSearchDropdown({
  results,
  loading,
  query,
  onNavigate,
}: {
  results: GlobalSearchResult[];
  loading: boolean;
  query: string;
  onNavigate: () => void;
}) {
  if (!query.trim()) return null;

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,28rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
        {loading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
      </div>
      <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
        {results.length === 0 && !loading ? (
          <p className="px-2 py-4 text-center text-sm text-slate-500">No matches yet.</p>
        ) : (
          <div className="space-y-2">
            {results.slice(0, 8).map((r) => (
              <div key={`${r.type}:${r.id}`} onClick={onNavigate}>
                <GlobalSearchResultCard result={r} compact />
              </div>
            ))}
          </div>
        )}
      </div>
      <Link
        href={`/admin/search?q=${encodeURIComponent(query.trim())}`}
        onClick={onNavigate}
        className="block border-t border-slate-100 bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold text-sky-800 hover:bg-sky-50"
      >
        View all results
      </Link>
    </div>
  );
}

type GlobalSearchBarProps = {
  initialQuery?: string;
  /** Compact pill for admin header; full width on search page. */
  variant?: "header" | "page";
  autoFocus?: boolean;
};

export function GlobalSearchBar({
  initialQuery = "",
  variant = "header",
  autoFocus = false,
}: GlobalSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(trimmed)}&limit=12`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = (await res.json()) as GlobalSearchResponse;
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchResults(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const shellCls =
    variant === "header"
      ? "relative w-full min-w-[12rem] max-w-md flex-1 sm:flex-none sm:w-72"
      : "relative w-full";

  const inputCls =
    variant === "header"
      ? "w-full rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
      : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";

  return (
    <div ref={rootRef} className={shellCls}>
      <form
        action="/admin/search"
        method="get"
        className="flex items-center gap-2"
        onSubmit={(e) => {
          if (variant === "header") {
            e.preventDefault();
            const trimmed = query.trim();
            if (trimmed) router.push(`/admin/search?q=${encodeURIComponent(trimmed)}`);
          }
        }}
      >
        <input
          name="q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && variant === "header") {
              e.preventDefault();
              const trimmed = query.trim();
              if (trimmed) router.push(`/admin/search?q=${encodeURIComponent(trimmed)}`);
            }
          }}
          placeholder="Search name, phone, email, source…"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Global search"
          className={inputCls}
        />
        {variant === "page" ? (
          <button
            type="submit"
            className="shrink-0 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm"
          >
            Search
          </button>
        ) : null}
      </form>
      {variant === "header" && open ? (
        <GlobalSearchDropdown
          results={results}
          loading={loading}
          query={query}
          onNavigate={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function GlobalSearchResultsSection({
  title,
  results,
}: {
  title: string;
  results: GlobalSearchResult[];
}) {
  if (results.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid gap-3">
        {results.map((r) => (
          <GlobalSearchResultCard key={`${r.type}:${r.id}`} result={r} />
        ))}
      </div>
    </section>
  );
}
