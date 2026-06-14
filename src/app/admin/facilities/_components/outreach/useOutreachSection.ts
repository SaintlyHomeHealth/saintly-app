"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  OutreachFacilityCard,
  OutreachSectionId,
  OutreachSectionPage,
  OutreachSummaryData,
} from "@/lib/crm/facility-outreach-types";
import {
  logOutreachPerfSummary,
  markOutreachInitialLoadDone,
  resetOutreachPerf,
  trackOutreachApiCall,
} from "@/lib/perf/outreach-dev-perf";

export const OUTREACH_PAGE_SIZE = 15;
const SECTION_CACHE_MS = 45_000;

type CachedPage = {
  page: OutreachSectionPage<OutreachFacilityCard>;
  at: number;
};

const sectionPageCache = new Map<string, CachedPage>();

function cacheKey(section: OutreachSectionId, geo: GeoCoords, offset: number) {
  const geoPart = geo ? `${geo.latitude},${geo.longitude}` : "none";
  return `${section}:${geoPart}:${offset}`;
}

type SectionResponse = {
  ok: boolean;
  section?: OutreachSectionId;
  data?: OutreachSectionPage<OutreachFacilityCard>;
  error?: string;
};

type SummaryResponse = {
  ok: boolean;
  data?: OutreachSummaryData;
  error?: string;
};

export type GeoCoords = { latitude: number; longitude: number } | null;

async function fetchOutreachSummary(geo: GeoCoords, radiusMiles: number): Promise<OutreachSummaryData | null> {
  const t0 = Date.now();
  const res = await fetch("/api/facilities/outreach-dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "summary",
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      radius_miles: radiusMiles,
    }),
  });
  const json = (await res.json()) as SummaryResponse;
  trackOutreachApiCall("summary", Date.now() - t0);
  return json.ok && json.data ? json.data : null;
}

async function fetchOutreachSection(
  section: OutreachSectionId,
  opts: { offset: number; limit: number; geo: GeoCoords; radiusMiles: number }
): Promise<OutreachSectionPage<OutreachFacilityCard> | null> {
  const t0 = Date.now();
  const res = await fetch("/api/facilities/outreach-dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "section",
      section,
      offset: opts.offset,
      limit: opts.limit,
      latitude: opts.geo?.latitude ?? null,
      longitude: opts.geo?.longitude ?? null,
      radius_miles: opts.radiusMiles,
    }),
  });
  const json = (await res.json()) as SectionResponse;
  trackOutreachApiCall(`section:${section}`, Date.now() - t0, json.data?.items.length ?? 0);
  return json.ok && json.data ? json.data : null;
}

export function useOutreachSummary(geo: GeoCoords, radiusMiles = 15) {
  const [summary, setSummary] = useState<OutreachSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const geoKey = geo ? `${geo.latitude},${geo.longitude}` : "none";
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOutreachSummary(geo, radiusMiles);
      if (!data) {
        setError("Could not load dashboard summary.");
        return;
      }
      setSummary(data);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [geo, radiusMiles]);

  useEffect(() => {
    if (!loadedRef.current) {
      resetOutreachPerf();
      loadedRef.current = true;
    }
    void refresh().then(() => {
      markOutreachInitialLoadDone();
      window.setTimeout(logOutreachPerfSummary, 1500);
    });
  }, [refresh, geoKey]);

  return { summary, loading, error, refresh };
}

export function useOutreachFacilitySection(
  section: OutreachSectionId,
  geo: GeoCoords,
  radiusMiles = 15
) {
  const [items, setItems] = useState<OutreachFacilityCard[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geoKey = geo ? `${geo.latitude},${geo.longitude}` : "none";

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const key = cacheKey(section, geo, offset);
      if (!append) {
        const cached = sectionPageCache.get(key);
        if (cached && Date.now() - cached.at < SECTION_CACHE_MS) {
          setItems(cached.page.items);
          setTotal(cached.page.total);
          setHasMore(cached.page.has_more);
          setLoading(false);
          setLoadingMore(false);
          return;
        }
      }

      try {
        const page = await fetchOutreachSection(section, {
          offset,
          limit: OUTREACH_PAGE_SIZE,
          geo,
          radiusMiles,
        });
        if (!page) {
          setError("Could not load facilities.");
          return;
        }
        if (!append) {
          sectionPageCache.set(key, { page, at: Date.now() });
        }
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setHasMore(page.has_more);
      } catch {
        setError("Network error loading facilities.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [section, geo, radiusMiles]
  );

  useEffect(() => {
    setItems([]);
    void loadPage(0, false);
  }, [section, geoKey, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    void loadPage(items.length, true);
  }, [hasMore, loadingMore, items.length, loadPage]);

  const refresh = useCallback(() => {
    sectionPageCache.delete(cacheKey(section, geo, 0));
    void loadPage(0, false);
  }, [loadPage, section, geo]);

  return { items, total, hasMore, loading, loadingMore, error, loadMore, refresh };
}
