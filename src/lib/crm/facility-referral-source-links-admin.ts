import "server-only";

import { randomBytes } from "crypto";

import { supabaseAdmin } from "@/lib/admin";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import type {
  CreateSourceLinkInput,
  FacilityReferralSourceLinkRow,
  ReferralSourceLinkStatus,
  ReferralSourceLinkType,
  ResolveSourceLinkInput,
  SourceLinkEventRow,
} from "@/lib/crm/facility-referral-source-link-types";
import { buildReferralTokenPublicPath } from "@/lib/crm/referral-link-url";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, isSalesAgentRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_LINK_TYPES = new Set<string>([
  "universal",
  "facility",
  "contact",
  "campaign",
  "packet",
  "material",
  "route",
  "activity",
  "rep",
  "custom",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function generateReferralToken(length = 16): string {
  return randomBytes(length).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, length).toLowerCase();
}

function mapLinkRow(raw: Record<string, unknown>): FacilityReferralSourceLinkRow {
  return {
    id: String(raw.id),
    token: typeof raw.token === "string" ? raw.token : null,
    short_slug: typeof raw.short_slug === "string" ? raw.short_slug : null,
    facility_id: typeof raw.facility_id === "string" ? raw.facility_id : null,
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    campaign_id: typeof raw.campaign_id === "string" ? raw.campaign_id : null,
    campaign_enrollment_id:
      typeof raw.campaign_enrollment_id === "string" ? raw.campaign_enrollment_id : null,
    packet_request_id: typeof raw.packet_request_id === "string" ? raw.packet_request_id : null,
    packet_material_id: typeof raw.packet_material_id === "string" ? raw.packet_material_id : null,
    route_plan_id: typeof raw.route_plan_id === "string" ? raw.route_plan_id : null,
    route_stop_id: typeof raw.route_stop_id === "string" ? raw.route_stop_id : null,
    activity_id: typeof raw.activity_id === "string" ? raw.activity_id : null,
    sales_rep_id: typeof raw.sales_rep_id === "string" ? raw.sales_rep_id : null,
    link_type: String(raw.link_type) as ReferralSourceLinkType,
    label: typeof raw.label === "string" ? raw.label : null,
    destination_url: typeof raw.destination_url === "string" ? raw.destination_url : null,
    material_type: typeof raw.material_type === "string" ? raw.material_type : null,
    default_source: typeof raw.default_source === "string" ? raw.default_source : null,
    status: (raw.status as ReferralSourceLinkStatus) ?? "active",
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
    last_used_at: typeof raw.last_used_at === "string" ? raw.last_used_at : null,
    use_count: typeof raw.use_count === "number" ? raw.use_count : 0,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
  };
}

async function attachLinkStats(links: FacilityReferralSourceLinkRow[]): Promise<FacilityReferralSourceLinkRow[]> {
  if (links.length === 0) return links;
  const ids = links.map((l) => l.id);

  const { data: events } = await supabaseAdmin
    .from("facility_referral_source_link_events")
    .select("source_link_id, event_type")
    .in("source_link_id", ids)
    .limit(10000);

  const stats = new Map<string, { views: number; submissions: number; leads: number }>();
  for (const e of events ?? []) {
    const id = String((e as { source_link_id?: string }).source_link_id ?? "");
    if (!id) continue;
    const prev = stats.get(id) ?? { views: 0, submissions: 0, leads: 0 };
    const type = String((e as { event_type?: string }).event_type ?? "");
    if (type === "view") prev.views++;
    if (type === "form_submitted") prev.submissions++;
    if (type === "lead_created") prev.leads++;
    stats.set(id, prev);
  }

  return links.map((l) => {
    const s = stats.get(l.id);
    return {
      ...l,
      view_count: s?.views ?? 0,
      submission_count: s?.submissions ?? 0,
      leads_created_count: s?.leads ?? 0,
    };
  });
}

async function enrichLinkLabels(
  links: FacilityReferralSourceLinkRow[],
  staffById: Map<string, { full_name: string | null; email: string | null }>
): Promise<FacilityReferralSourceLinkRow[]> {
  const facilityIds = [...new Set(links.map((l) => l.facility_id).filter(Boolean))] as string[];
  const campaignIds = [...new Set(links.map((l) => l.campaign_id).filter(Boolean))] as string[];
  const packetRequestIds = [...new Set(links.map((l) => l.packet_request_id).filter(Boolean))] as string[];
  const materialIds = [...new Set(links.map((l) => l.packet_material_id).filter(Boolean))] as string[];

  const facilityNames = new Map<string, string>();
  if (facilityIds.length > 0) {
    const { data } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of data ?? []) {
      facilityNames.set(String((f as { id: string }).id), String((f as { name?: string }).name ?? "Facility"));
    }
  }

  const campaignNames = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data } = await supabaseAdmin.from("facility_campaigns").select("id, name").in("id", campaignIds);
    for (const c of data ?? []) {
      campaignNames.set(String((c as { id: string }).id), String((c as { name?: string }).name ?? "Campaign"));
    }
  }

  const packetRequestLabels = new Map<string, string>();
  if (packetRequestIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("facility_packet_requests")
      .select("id, status, recipient_name, requested_at")
      .in("id", packetRequestIds);
    for (const p of data ?? []) {
      const id = String((p as { id: string }).id);
      const recipient = String((p as { recipient_name?: string }).recipient_name ?? "Recipient");
      const status = String((p as { status?: string }).status ?? "pending");
      packetRequestLabels.set(id, `Packet · ${recipient} (${status})`);
    }
  }

  const materialNames = new Map<string, string>();
  if (materialIds.length > 0) {
    const { data } = await supabaseAdmin.from("facility_packet_materials").select("id, name").in("id", materialIds);
    for (const m of data ?? []) {
      materialNames.set(String((m as { id: string }).id), String((m as { name?: string }).name ?? "Material"));
    }
  }

  return links.map((l) => ({
    ...l,
    facility_name: l.facility_id ? facilityNames.get(l.facility_id) ?? null : null,
    campaign_name: l.campaign_id ? campaignNames.get(l.campaign_id) ?? null : null,
    sales_rep_label: l.sales_rep_id ? staffLabelFromLookup(l.sales_rep_id, staffById) : null,
    packet_request_label: l.packet_request_id ? packetRequestLabels.get(l.packet_request_id) ?? l.packet_request_id.slice(0, 8) : null,
    packet_material_name: l.packet_material_id ? materialNames.get(l.packet_material_id) ?? null : null,
    packet_delivery_method:
      typeof l.metadata?.delivery_method === "string" ? l.metadata.delivery_method : null,
    destination_url: l.destination_url ?? (l.token || l.short_slug ? buildReferralTokenPublicPath(l.short_slug ?? l.token!) : null),
  }));
}

export type ResolvedPublicSourceLink = FacilityReferralSourceLinkRow & {
  public_path: string;
  default_source: string;
};

export async function resolvePublicSourceLinkBySegment(
  segment: string
): Promise<ResolvedPublicSourceLink | null> {
  const t = segment.trim();
  if (!t) return null;

  let query = supabaseAdmin
    .from("facility_referral_source_links")
    .select("*")
    .eq("status", "active")
    .limit(1);

  const { data: byToken } = await query.eq("token", t).maybeSingle();
  let row = byToken;

  if (!row?.id) {
    const { data: bySlug } = await supabaseAdmin
      .from("facility_referral_source_links")
      .select("*")
      .eq("short_slug", t)
      .eq("status", "active")
      .maybeSingle();
    row = bySlug;
  }

  if (!row?.id) return null;

  const link = mapLinkRow(row as Record<string, unknown>);
  const segmentOut = (link.short_slug ?? link.token ?? t).trim();
  const defaultSource =
    link.default_source ??
    (link.link_type === "campaign" ? "campaign_qr" : link.link_type === "rep" ? "rep_qr" : "printed_materials");

  return {
    ...link,
    public_path: buildReferralTokenPublicPath(segmentOut),
    default_source: defaultSource,
  };
}

export async function listSourceLinks(
  staff: StaffProfile,
  filters: {
    link_type?: string | null;
    campaign_id?: string | null;
    facility_id?: string | null;
    sales_rep_id?: string | null;
    status?: string | null;
  }
): Promise<FacilityReferralSourceLinkRow[]> {
  if (!canAccessFacilityFieldTools(staff)) return [];

  let query = supabaseAdmin
    .from("facility_referral_source_links")
    .select("*")
    .neq("link_type", "universal")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.link_type?.trim()) query = query.eq("link_type", filters.link_type.trim());
  if (filters.campaign_id && UUID_RE.test(filters.campaign_id)) {
    query = query.eq("campaign_id", filters.campaign_id);
  }
  if (filters.facility_id && UUID_RE.test(filters.facility_id)) {
    query = query.eq("facility_id", filters.facility_id);
  }
  if (filters.status?.trim()) query = query.eq("status", filters.status.trim());
  else query = query.in("status", ["active", "inactive"]);

  const salesRepOnly = isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff);
  if (salesRepOnly) {
    query = query.or(`sales_rep_id.eq.${staff.user_id},created_by.eq.${staff.user_id},link_type.eq.facility`);
  } else if (filters.sales_rep_id && UUID_RE.test(filters.sales_rep_id)) {
    query = query.eq("sales_rep_id", filters.sales_rep_id);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[source-links] list:", error.message);
    return [];
  }

  const { data: staffRows } = await supabaseAdmin.from("staff_profiles").select("user_id, full_name, email");
  const staffById = new Map<string, { full_name: string | null; email: string | null }>();
  for (const s of staffRows ?? []) {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    staffById.set(row.user_id, { full_name: row.full_name, email: row.email });
  }

  let links = (data ?? []).map((r) => mapLinkRow(r as Record<string, unknown>));
  links = await enrichLinkLabels(links, staffById);
  links = await attachLinkStats(links);
  return links;
}

export async function createSourceLink(
  staff: StaffProfile,
  input: CreateSourceLinkInput
): Promise<{ ok: true; link: FacilityReferralSourceLinkRow } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const linkType = (input.link_type ?? "").trim();
  if (!ALLOWED_LINK_TYPES.has(linkType) || linkType === "universal") {
    return { ok: false, error: "invalid_link_type" };
  }

  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "label_required" };

  let token = generateReferralToken(16);
  let shortSlug = (input.short_slug ?? "").trim() || null;
  if (shortSlug) shortSlug = slugify(shortSlug);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("facility_referral_source_links")
      .insert({
        token,
        short_slug: shortSlug,
        link_type: linkType,
        label,
        facility_id: input.facility_id && UUID_RE.test(input.facility_id) ? input.facility_id : null,
        contact_id: input.contact_id && UUID_RE.test(input.contact_id) ? input.contact_id : null,
        campaign_id: input.campaign_id && UUID_RE.test(input.campaign_id) ? input.campaign_id : null,
        sales_rep_id: input.sales_rep_id && UUID_RE.test(input.sales_rep_id) ? input.sales_rep_id : null,
        material_type: (input.material_type ?? "").trim() || null,
        default_source: (input.default_source ?? "").trim() || null,
        destination_url: shortSlug ? buildReferralTokenPublicPath(shortSlug) : buildReferralTokenPublicPath(token),
        status: input.status ?? "active",
        created_by: staff.user_id,
      })
      .select("*")
      .single();

    if (!error && data?.id) {
      const link = mapLinkRow(data as Record<string, unknown>);
      return { ok: true, link };
    }

    if (error?.message?.includes("duplicate") || error?.code === "23505") {
      token = generateReferralToken(16);
      if (shortSlug) shortSlug = `${shortSlug}-${generateReferralToken(4)}`;
      continue;
    }

    console.warn("[source-links] create:", error?.message);
    return { ok: false, error: "create_failed" };
  }

  return { ok: false, error: "token_collision" };
}

export async function resolveOrCreateSourceLink(
  staff: StaffProfile,
  input: ResolveSourceLinkInput
): Promise<{ ok: true; link: FacilityReferralSourceLinkRow } | { ok: false; error: string }> {
  if (!canAccessFacilityFieldTools(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const linkType = input.link_type;
  if (!ALLOWED_LINK_TYPES.has(linkType)) {
    return { ok: false, error: "invalid_link_type" };
  }

  let query = supabaseAdmin
    .from("facility_referral_source_links")
    .select("*")
    .eq("link_type", linkType)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.facility_id && UUID_RE.test(input.facility_id)) {
    query = query.eq("facility_id", input.facility_id);
  }
  if (input.campaign_id && UUID_RE.test(input.campaign_id)) {
    query = query.eq("campaign_id", input.campaign_id);
  }
  if (input.sales_rep_id && UUID_RE.test(input.sales_rep_id)) {
    query = query.eq("sales_rep_id", input.sales_rep_id);
  }

  const { data: existing } = await query.maybeSingle();
  if (existing?.id) {
    return { ok: true, link: mapLinkRow(existing as Record<string, unknown>) };
  }

  if (!input.create_if_missing) {
    return { ok: false, error: "not_found" };
  }

  const canCreate =
    canAccessFacilityAdminTools(staff) ||
    linkType === "facility" ||
    (linkType === "rep" && input.sales_rep_id === staff.user_id);

  if (!canCreate) {
    return { ok: false, error: "forbidden" };
  }

  let label = (input.label ?? "").trim();
  if (!label) {
    if (input.facility_id) {
      const { data: f } = await supabaseAdmin.from("facilities").select("name").eq("id", input.facility_id).maybeSingle();
      label = f?.name ? `${String(f.name)} referral link` : "Facility referral link";
    } else if (input.campaign_id) {
      const { data: c } = await supabaseAdmin
        .from("facility_campaigns")
        .select("name")
        .eq("id", input.campaign_id)
        .maybeSingle();
      label = c?.name ? `${String(c.name)} referral link` : "Campaign referral link";
    } else if (input.sales_rep_id) {
      label = "Rep referral link";
    } else {
      label = "Referral link";
    }
  }

  if (canAccessFacilityAdminTools(staff)) {
    return createSourceLink(staff, {
      link_type: linkType,
      label,
      facility_id: input.facility_id ?? null,
      campaign_id: input.campaign_id ?? null,
      sales_rep_id: input.sales_rep_id ?? staff.user_id,
      material_type: input.material_type ?? null,
      default_source:
        linkType === "campaign" ? "campaign_qr" : linkType === "rep" ? "rep_qr" : "facility_qr",
    });
  }

  const token = generateReferralToken(16);
  const { data, error } = await supabaseAdmin
    .from("facility_referral_source_links")
    .insert({
      token,
      link_type: linkType,
      label,
      facility_id: input.facility_id && UUID_RE.test(input.facility_id) ? input.facility_id : null,
      campaign_id: input.campaign_id && UUID_RE.test(input.campaign_id) ? input.campaign_id : null,
      sales_rep_id: input.sales_rep_id && UUID_RE.test(input.sales_rep_id) ? input.sales_rep_id : staff.user_id,
      material_type: input.material_type ?? null,
      default_source: linkType === "rep" ? "rep_qr" : "facility_qr",
      destination_url: buildReferralTokenPublicPath(token),
      status: "active",
      created_by: staff.user_id,
    })
    .select("*")
    .single();

  if (error || !data?.id) {
    console.warn("[source-links] resolve create:", error?.message);
    return { ok: false, error: "create_failed" };
  }

  return { ok: true, link: mapLinkRow(data as Record<string, unknown>) };
}

export async function archiveSourceLink(
  staff: StaffProfile,
  linkId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) {
    return { ok: false, error: "forbidden" };
  }
  if (!UUID_RE.test(linkId)) return { ok: false, error: "invalid_id" };

  const { error } = await supabaseAdmin
    .from("facility_referral_source_links")
    .update({ status: "archived" })
    .eq("id", linkId);

  if (error) return { ok: false, error: "archive_failed" };
  return { ok: true };
}

export async function listSourceLinkEvents(
  staff: StaffProfile,
  linkId: string
): Promise<SourceLinkEventRow[]> {
  if (!canAccessFacilityFieldTools(staff)) return [];
  if (!UUID_RE.test(linkId)) return [];

  const { data } = await supabaseAdmin
    .from("facility_referral_source_link_events")
    .select("id, event_type, created_at, lead_id, facility_id, metadata")
    .eq("source_link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    event_type: String((r as { event_type: string }).event_type),
    created_at: String((r as { created_at: string }).created_at),
    lead_id: typeof (r as { lead_id?: string }).lead_id === "string" ? (r as { lead_id: string }).lead_id : null,
    facility_id:
      typeof (r as { facility_id?: string }).facility_id === "string"
        ? (r as { facility_id: string }).facility_id
        : null,
    metadata:
      (r as { metadata?: unknown }).metadata &&
      typeof (r as { metadata?: unknown }).metadata === "object" &&
      !Array.isArray((r as { metadata?: unknown }).metadata)
        ? ((r as { metadata: Record<string, unknown> }).metadata as Record<string, unknown>)
        : null,
  }));
}

export async function aggregateSourceLinkAnalytics(input: {
  startIso: string;
  endIso: string;
}): Promise<{
  linksCreated: number;
  tokenLeads: number;
  tokenViews: number;
  topLinks: Array<{ linkId: string; label: string; leads: number; views: number }>;
}> {
  const { count: linksCreated } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("id", { count: "exact", head: true })
    .neq("link_type", "universal")
    .gte("created_at", input.startIso)
    .lte("created_at", input.endIso);

  const { data: events } = await supabaseAdmin
    .from("facility_referral_source_link_events")
    .select("source_link_id, event_type")
    .gte("created_at", input.startIso)
    .lte("created_at", input.endIso)
    .not("source_link_id", "is", null)
    .limit(10000);

  let tokenViews = 0;
  let tokenLeads = 0;
  const byLink = new Map<string, { views: number; leads: number }>();

  for (const e of events ?? []) {
    const id = String((e as { source_link_id?: string }).source_link_id ?? "");
    if (!id) continue;
    const type = String((e as { event_type?: string }).event_type ?? "");
    const prev = byLink.get(id) ?? { views: 0, leads: 0 };
    if (type === "view") {
      tokenViews++;
      prev.views++;
    }
    if (type === "lead_created") {
      tokenLeads++;
      prev.leads++;
    }
    byLink.set(id, prev);
  }

  const topIds = [...byLink.entries()].sort((a, b) => b[1].leads - a[1].leads).slice(0, 8);
  const linkIds = topIds.map(([id]) => id);
  const labels = new Map<string, string>();

  if (linkIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from("facility_referral_source_links")
      .select("id, label")
      .in("id", linkIds);
    for (const l of links ?? []) {
      labels.set(String((l as { id: string }).id), String((l as { label?: string }).label ?? "Link"));
    }
  }

  return {
    linksCreated: linksCreated ?? 0,
    tokenLeads,
    tokenViews,
    topLinks: topIds.map(([linkId, stats]) => ({
      linkId,
      label: labels.get(linkId) ?? "Link",
      leads: stats.leads,
      views: stats.views,
    })),
  };
}
