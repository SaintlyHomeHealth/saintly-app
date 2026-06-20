"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

import { globalSearchTypeLabel } from "@/lib/admin/global-search/hrefs";
import { isGlobalSearchResultCurrentPage } from "@/lib/admin/global-search/navigation";
import { formatMatchedFieldLabel } from "@/lib/admin/global-search/source-trail";
import type { GlobalSearchResponse, GlobalSearchResult } from "@/lib/admin/global-search/types";

const VIEWPORT_MARGIN_PX = 12;
const DROPDOWN_MAX_WIDTH_PX = 560;
const HEADER_MIN_QUERY_LEN = 2;
const HEADER_DEBOUNCE_MS = 400;
const PAGE_DEBOUNCE_MS = 300;

function isFullSearchResultsPage(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "");
  return p === "/admin/search" || p === "/workspace/phone/search";
}

function computeDropdownStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const maxAllowedWidth = viewportW - VIEWPORT_MARGIN_PX * 2;
  const width = Math.min(DROPDOWN_MAX_WIDTH_PX, maxAllowedWidth);

  let left = rect.left;
  if (left + width > viewportW - VIEWPORT_MARGIN_PX) {
    left = viewportW - VIEWPORT_MARGIN_PX - width;
  }
  if (left < VIEWPORT_MARGIN_PX) {
    left = VIEWPORT_MARGIN_PX;
  }

  return {
    position: "fixed",
    top: rect.bottom + 8,
    left,
    width,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px)`,
    zIndex: 9999,
  };
}

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
  highlighted = false,
  isCurrentPage = false,
  onNavigate,
}: {
  result: GlobalSearchResult;
  compact?: boolean;
  highlighted?: boolean;
  isCurrentPage?: boolean;
  onNavigate?: () => void;
}) {
  const matched = result.matchedFields.map(formatMatchedFieldLabel).join(" · ");

  return (
    <Link
      href={result.href}
      onClick={(e) => {
        if (isCurrentPage) {
          e.preventDefault();
          onNavigate?.();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        onNavigate?.();
      }}
      aria-current={isCurrentPage ? "page" : undefined}
      className={`block rounded-xl border bg-white transition hover:border-sky-200 hover:bg-sky-50/40 hover:shadow-sm ${
        highlighted
          ? "border-sky-300 bg-sky-50/60 ring-2 ring-sky-200"
          : isCurrentPage
            ? "border-emerald-200 bg-emerald-50/30"
            : "border-slate-200/90"
      } ${compact ? "px-3 py-2.5" : "px-4 py-3.5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{result.title}</span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
              {globalSearchTypeLabel(result.type)}
            </span>
            {isCurrentPage ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                Currently open
              </span>
            ) : null}
            {result.sharedPhoneWarning ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                Shared phone ({result.sharedPhoneRecordCount ?? 2})
              </span>
            ) : null}
          </div>
          <div className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 ${compact ? "hidden sm:flex" : ""}`}>
            {result.phone ? <span>{result.phone}</span> : null}
            {result.email ? <span>{result.email}</span> : null}
            {result.status ? <span className="capitalize">{result.status}</span> : null}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-sky-800">
          {isCurrentPage ? "Viewing" : "Open →"}
        </span>
      </div>

      {result.sharedPhoneWarning ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950">
          Same phone number is linked to {result.sharedPhoneRecordCount ?? "multiple"} CRM records. Review before
          texting or calling.
        </p>
      ) : null}

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
  anchorRef,
  panelRef,
  pathname,
  search,
  highlightIndex,
  onNavigate,
}: {
  results: GlobalSearchResult[];
  loading: boolean;
  query: string;
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  pathname: string;
  search: string;
  highlightIndex: number;
  onNavigate: () => void;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setStyle(computeDropdownStyle(anchor));
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, query, results.length, loading]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  if (!query.trim() || !mounted || !style) return null;

  const previewResults = results.slice(0, 8);

  const panel = (
    <div
      ref={panelRef}
      style={style}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
      role="listbox"
      aria-label="Global search preview"
    >
      <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
        {loading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}`}
      </div>
      <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
        {results.length === 0 && !loading ? (
          <p className="px-2 py-4 text-center text-sm text-slate-500">No matches yet.</p>
        ) : (
          <div className="space-y-2">
            {previewResults.map((r, index) => (
              <GlobalSearchResultCard
                key={`${r.type}:${r.id}`}
                result={r}
                compact
                highlighted={index === highlightIndex}
                isCurrentPage={isGlobalSearchResultCurrentPage(pathname, search, r.href)}
                onNavigate={onNavigate}
              />
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

  return createPortal(panel, document.body);
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
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const onFullSearchPage = isFullSearchResultsPage(pathname);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewResultCount = Math.min(results.length, 8);

  useEffect(() => {
    if (onFullSearchPage) setOpen(false);
  }, [onFullSearchPage]);

  const fetchResults = useCallback(async (q: string, searchMode: "preview" | "full") => {
    const trimmed = q.trim();
    const minLen = searchMode === "preview" ? HEADER_MIN_QUERY_LEN : 1;
    if (trimmed.length < minLen) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      params.set("limit", searchMode === "preview" ? "12" : "50");
      if (searchMode === "preview") params.set("mode", "preview");
      const res = await fetch(`/api/admin/global-search?${params.toString()}`);
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
    if (variant === "header" && onFullSearchPage) return;
    if (variant === "header" && !open) return;

    const searchMode = variant === "header" ? "preview" : "full";
    const debounceMs = variant === "header" ? HEADER_DEBOUNCE_MS : PAGE_DEBOUNCE_MS;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchResults(query, searchMode);
    }, debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults, variant, open, onFullSearchPage]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, results]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const shellCls =
    variant === "header"
      ? "relative z-50 w-full min-w-[12rem] max-w-md flex-1 overflow-visible sm:flex-none sm:w-72"
      : "relative w-full overflow-visible";

  const inputCls =
    variant === "header"
      ? "w-full rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
      : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";

  const showHeaderDropdown =
    variant === "header" &&
    open &&
    !onFullSearchPage &&
    query.trim().length >= HEADER_MIN_QUERY_LEN;

  return (
    <div ref={rootRef} className={shellCls}>
      <div ref={anchorRef}>
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
            if (!onFullSearchPage) setOpen(true);
          }}
          onFocus={() => {
            if (!onFullSearchPage) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (variant !== "header") return;

            if (e.key === "Escape") {
              setOpen(false);
              setHighlightIndex(-1);
              return;
            }

            if (showHeaderDropdown && previewResultCount > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((current) => {
                  if (current < 0) return 0;
                  return Math.min(current + 1, previewResultCount - 1);
                });
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((current) => Math.max(current - 1, 0));
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const selected = highlightIndex >= 0 ? results[highlightIndex] : null;
                if (selected?.href) {
                  router.push(selected.href);
                  setOpen(false);
                  setHighlightIndex(-1);
                  return;
                }
              }
            }

            if (e.key === "Enter") {
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
      </div>
      {showHeaderDropdown ? (
        <GlobalSearchDropdown
          results={results}
          loading={loading}
          query={query}
          anchorRef={anchorRef}
          panelRef={dropdownRef}
          pathname={pathname}
          search={search}
          highlightIndex={highlightIndex}
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
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  if (results.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="grid gap-3">
        {results.map((r) => (
          <GlobalSearchResultCard
            key={`${r.type}:${r.id}`}
            result={r}
            isCurrentPage={isGlobalSearchResultCurrentPage(pathname, search, r.href)}
          />
        ))}
      </div>
    </section>
  );
}
