import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  loadOutreachDashboard,
  loadOutreachSection,
  loadOutreachSummary,
} from "@/lib/crm/facility-outreach-dashboard";
import type {
  OutreachDashboardData,
  OutreachSectionId,
  OutreachSectionPage,
  OutreachSummaryData,
} from "@/lib/crm/facility-outreach-types";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type OutreachDashboardResponse =
  | { ok: true; data: OutreachDashboardData }
  | { ok: false; error: string };

export type OutreachSummaryResponse =
  | { ok: true; data: OutreachSummaryData }
  | { ok: false; error: string };

export type OutreachSectionResponse =
  | {
      ok: true;
      section: OutreachSectionId;
      data: OutreachSectionPage<unknown>;
    }
  | { ok: false; error: string };

type OutreachDashboardBody = {
  mode?: "summary" | "section" | "full";
  section?: OutreachSectionId;
  limit?: number;
  offset?: number;
  latitude?: number | null;
  longitude?: number | null;
  radius_miles?: number | null;
};

const VALID_SECTIONS = new Set<OutreachSectionId>([
  "follow_ups_due",
  "near_me",
  "not_visited",
  "high_priority",
  "recent_activity",
  "packet_requests_due",
]);

function parseGeoBody(body: OutreachDashboardBody) {
  return {
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    radiusMiles: body.radius_miles ?? 15,
  };
}

async function handleRequest(body: OutreachDashboardBody) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const geo = parseGeoBody(body);
  const mode = body.mode ?? "full";

  try {
    if (mode === "summary") {
      const data = await loadOutreachSummary(supabaseAdmin, staff, geo);
      return NextResponse.json({ ok: true, data } satisfies OutreachSummaryResponse);
    }

    if (mode === "section") {
      const section = body.section;
      if (!section || !VALID_SECTIONS.has(section)) {
        return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 400 });
      }
      const data = await loadOutreachSection(supabaseAdmin, staff, section, {
        ...geo,
        limit: body.limit,
        offset: body.offset,
      });
      return NextResponse.json({ ok: true, section, data } satisfies OutreachSectionResponse);
    }

    const data = await loadOutreachDashboard(supabaseAdmin, staff, geo);
    return NextResponse.json({ ok: true, data } satisfies OutreachDashboardResponse);
  } catch (e) {
    console.warn("[outreach-dashboard]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: OutreachDashboardBody = {};
  try {
    body = (await req.json()) as OutreachDashboardBody;
  } catch {
    body = {};
  }
  return handleRequest(body);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = url.searchParams.get("latitude");
  const lng = url.searchParams.get("longitude");
  const radius = url.searchParams.get("radius_miles");
  const mode = url.searchParams.get("mode") as OutreachDashboardBody["mode"] | null;
  const section = url.searchParams.get("section") as OutreachSectionId | null;
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  return handleRequest({
    mode: mode ?? "full",
    section: section ?? undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
    latitude: lat ? Number(lat) : null,
    longitude: lng ? Number(lng) : null,
    radius_miles: radius ? Number(radius) : 15,
  });
}
