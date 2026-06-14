/**
 * Client-side route draft for field-sales day planning.
 */

const STORAGE_KEY = "saintly_facility_route_draft_v1";

export type RouteStopVisitState = "pending" | "visited" | "skipped";

export type FacilityRouteDraftStop = {
  localId: string;
  /** Portal facility id when stop is in Saintly CRM */
  facilityId?: string;
  /** Google place id for external / not-yet-imported stops */
  googlePlaceId?: string;
  name: string;
  address?: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  type?: string | null;
  source?: "portal" | "google_places";
  portalStatus?: "already_in_portal" | "not_in_portal" | "possible_match";
  notes?: string | null;
  visitState?: RouteStopVisitState;
  priority?: string | null;
  nextFollowUpAt?: string | null;
  addedAt: string;
};

export type FacilityRouteDraft = {
  stops: FacilityRouteDraftStop[];
  updatedAt: string;
};

function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeStop(raw: FacilityRouteDraftStop): FacilityRouteDraftStop {
  return {
    ...raw,
    localId: raw.localId || newLocalId(),
    visitState: raw.visitState ?? "pending",
  };
}

function readDraft(): FacilityRouteDraft {
  if (typeof window === "undefined") {
    return { stops: [], updatedAt: new Date().toISOString() };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { stops: [], updatedAt: new Date().toISOString() };
    const parsed = JSON.parse(raw) as FacilityRouteDraft;
    if (!Array.isArray(parsed.stops)) return { stops: [], updatedAt: new Date().toISOString() };
    return {
      ...parsed,
      stops: parsed.stops.map((s) => normalizeStop(s as FacilityRouteDraftStop)),
    };
  } catch {
    return { stops: [], updatedAt: new Date().toISOString() };
  }
}

function writeDraft(draft: FacilityRouteDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // localStorage unavailable — ignore
  }
}

function stopKey(stop: FacilityRouteDraftStop): string {
  if (stop.facilityId) return `portal:${stop.facilityId}`;
  if (stop.googlePlaceId) return `google:${stop.googlePlaceId}`;
  return `name:${stop.name}`;
}

export function getFacilityRouteDraft(): FacilityRouteDraft {
  return readDraft();
}

export function getFacilityRouteDraftCount(): number {
  return readDraft().stops.length;
}

export function isFacilityInRouteDraft(facilityId: string): boolean {
  return readDraft().stops.some((s) => s.facilityId === facilityId);
}

export function isExternalPlaceInRouteDraft(googlePlaceId: string): boolean {
  return readDraft().stops.some((s) => s.googlePlaceId === googlePlaceId);
}

export function isStopInRouteDraft(opts: {
  facilityId?: string | null;
  googlePlaceId?: string | null;
}): boolean {
  const draft = readDraft();
  if (opts.facilityId && draft.stops.some((s) => s.facilityId === opts.facilityId)) return true;
  if (opts.googlePlaceId && draft.stops.some((s) => s.googlePlaceId === opts.googlePlaceId)) return true;
  return false;
}

export type PortalRouteStopInput = {
  facilityId: string;
  name: string;
  address?: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  type?: string | null;
  priority?: string | null;
  nextFollowUpAt?: string | null;
};

export function addFacilityToRouteDraft(
  facilityId: string,
  name: string,
  extras?: Partial<PortalRouteStopInput>
): FacilityRouteDraft {
  const draft = readDraft();
  if (draft.stops.some((s) => s.facilityId === facilityId)) return draft;
  const next: FacilityRouteDraft = {
    stops: [
      ...draft.stops,
      normalizeStop({
        localId: newLocalId(),
        facilityId,
        name,
        address: extras?.address,
        phone: extras?.phone ?? null,
        latitude: extras?.latitude ?? null,
        longitude: extras?.longitude ?? null,
        type: extras?.type ?? null,
        priority: extras?.priority ?? null,
        nextFollowUpAt: extras?.nextFollowUpAt ?? null,
        source: "portal",
        portalStatus: "already_in_portal",
        visitState: "pending",
        addedAt: new Date().toISOString(),
      }),
    ],
    updatedAt: new Date().toISOString(),
  };
  writeDraft(next);
  return next;
}

export type ExternalRouteStopInput = {
  googlePlaceId: string;
  name: string;
  address: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  type?: string | null;
  portalStatus?: "not_in_portal" | "possible_match";
};

export function addExternalPlaceToRouteDraft(input: ExternalRouteStopInput): FacilityRouteDraft {
  const draft = readDraft();
  if (draft.stops.some((s) => s.googlePlaceId === input.googlePlaceId)) return draft;
  const next: FacilityRouteDraft = {
    stops: [
      ...draft.stops,
      normalizeStop({
        localId: newLocalId(),
        googlePlaceId: input.googlePlaceId,
        name: input.name,
        address: input.address,
        address_line_1: input.address_line_1,
        city: input.city,
        state: input.state,
        zip: input.zip,
        phone: input.phone ?? null,
        website: input.website ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        type: input.type ?? null,
        source: "google_places",
        portalStatus: input.portalStatus ?? "not_in_portal",
        visitState: "pending",
        addedAt: new Date().toISOString(),
      }),
    ],
    updatedAt: new Date().toISOString(),
  };
  writeDraft(next);
  return next;
}

export function setRouteDraftStops(stops: FacilityRouteDraftStop[]): FacilityRouteDraft {
  const next: FacilityRouteDraft = {
    stops: stops.map(normalizeStop),
    updatedAt: new Date().toISOString(),
  };
  writeDraft(next);
  return next;
}

export function removeStopByLocalId(localId: string): FacilityRouteDraft {
  const draft = readDraft();
  const next: FacilityRouteDraft = {
    stops: draft.stops.filter((s) => s.localId !== localId),
    updatedAt: new Date().toISOString(),
  };
  writeDraft(next);
  return next;
}

export function removeStopFromRouteDraft(opts: {
  facilityId?: string | null;
  googlePlaceId?: string | null;
  localId?: string | null;
}): FacilityRouteDraft {
  if (opts.localId) return removeStopByLocalId(opts.localId);
  const draft = readDraft();
  const next: FacilityRouteDraft = {
    stops: draft.stops.filter((s) => {
      if (opts.facilityId && s.facilityId === opts.facilityId) return false;
      if (opts.googlePlaceId && s.googlePlaceId === opts.googlePlaceId) return false;
      return true;
    }),
    updatedAt: new Date().toISOString(),
  };
  writeDraft(next);
  return next;
}

/** @deprecated use removeStopFromRouteDraft */
export function removeFacilityFromRouteDraft(facilityId: string): FacilityRouteDraft {
  return removeStopFromRouteDraft({ facilityId });
}

export function moveStopInRoute(localId: string, direction: "up" | "down"): FacilityRouteDraft {
  const draft = readDraft();
  const idx = draft.stops.findIndex((s) => s.localId === localId);
  if (idx < 0) return draft;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= draft.stops.length) return draft;
  const stops = [...draft.stops];
  [stops[idx], stops[target]] = [stops[target], stops[idx]];
  return setRouteDraftStops(stops);
}

export function reverseRouteDraftOrder(): FacilityRouteDraft {
  const draft = readDraft();
  return setRouteDraftStops([...draft.stops].reverse());
}

export function updateStopVisitState(
  localId: string,
  visitState: RouteStopVisitState
): FacilityRouteDraft {
  const draft = readDraft();
  const stops = draft.stops.map((s) =>
    s.localId === localId ? { ...s, visitState } : s
  );
  return setRouteDraftStops(stops);
}

export function promoteStopToPortal(
  localId: string,
  facilityId: string,
  name?: string
): FacilityRouteDraft {
  const draft = readDraft();
  const stops = draft.stops.map((s) =>
    s.localId === localId
      ? {
          ...s,
          facilityId,
          name: name ?? s.name,
          source: "portal" as const,
          portalStatus: "already_in_portal" as const,
        }
      : s
  );
  return setRouteDraftStops(stops);
}

export function mergeEnrichedPortalFields(
  enrichments: Record<
    string,
    {
      address?: string;
      phone?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      type?: string | null;
      priority?: string | null;
      nextFollowUpAt?: string | null;
    }
  >
): FacilityRouteDraft {
  const draft = readDraft();
  const stops = draft.stops.map((s) => {
    if (!s.facilityId) return s;
    const e = enrichments[s.facilityId];
    if (!e) return s;
    return {
      ...s,
      address: s.address || e.address,
      phone: s.phone ?? e.phone ?? null,
      latitude: s.latitude ?? e.latitude ?? null,
      longitude: s.longitude ?? e.longitude ?? null,
      type: s.type ?? e.type ?? null,
      priority: s.priority ?? e.priority ?? null,
      nextFollowUpAt: s.nextFollowUpAt ?? e.nextFollowUpAt ?? null,
    };
  });
  return setRouteDraftStops(stops);
}

export function clearFacilityRouteDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const FACILITY_ROUTE_DRAFT_EVENT = "saintly:facility-route-draft-changed";

export function notifyRouteDraftChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FACILITY_ROUTE_DRAFT_EVENT));
}

export function routeDraftStopKeys(): Set<string> {
  return new Set(readDraft().stops.map(stopKey));
}

export type RoutePlanStopCreateInput = {
  facility_id?: string | null;
  google_place_id?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  portal_status?: string | null;
  notes?: string | null;
};

export function draftStopsToCreateInput(stops: FacilityRouteDraftStop[]): RoutePlanStopCreateInput[] {
  return stops.map((stop) => {
    const address =
      stop.address?.trim() ||
      [stop.address_line_1, stop.city, stop.state, stop.zip].filter(Boolean).join(", ") ||
      null;
    return {
      facility_id: stop.facilityId ?? null,
      google_place_id: stop.googlePlaceId ?? null,
      name: stop.name,
      address,
      phone: stop.phone ?? null,
      latitude: stop.latitude ?? null,
      longitude: stop.longitude ?? null,
      source: stop.source ?? (stop.facilityId ? "portal" : stop.googlePlaceId ? "google_places" : null),
      portal_status:
        stop.portalStatus ?? (stop.facilityId ? "already_in_portal" : stop.googlePlaceId ? "not_in_portal" : null),
      notes: stop.notes ?? null,
    };
  });
}
