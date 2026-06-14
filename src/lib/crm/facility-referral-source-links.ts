import "server-only";

import { createHash } from "crypto";

import { supabaseAdmin } from "@/lib/admin";
import { generateReferralToken } from "@/lib/crm/facility-referral-source-links-admin";
import type { FacilityReferralSourceLinkRow } from "@/lib/crm/facility-referral-source-link-types";
import {
  buildReferralTokenPublicPath,
  buildReferralTokenPublicUrl,
  publicTokenSegment,
} from "@/lib/crm/referral-link-url";

export type SourceLinkEventType =
  | "view"
  | "form_started"
  | "form_submitted"
  | "lead_created"
  | "link_copied"
  | "qr_downloaded";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hashClientIp(ip: string | null | undefined): string | null {
  const t = (ip ?? "").trim();
  if (!t) return null;
  const salt = process.env.REFERRAL_IP_HASH_SALT ?? "saintly-referral-v1";
  return createHash("sha256").update(`${salt}:${t}`).digest("hex").slice(0, 40);
}

function mapTokenLinkRow(raw: Record<string, unknown>): FacilityReferralSourceLinkRow {
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
    link_type: String(raw.link_type) as FacilityReferralSourceLinkRow["link_type"],
    label: typeof raw.label === "string" ? raw.label : null,
    destination_url: typeof raw.destination_url === "string" ? raw.destination_url : null,
    material_type: typeof raw.material_type === "string" ? raw.material_type : null,
    default_source: typeof raw.default_source === "string" ? raw.default_source : null,
    status: (raw.status as FacilityReferralSourceLinkRow["status"]) ?? "active",
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

export async function getUniversalSourceLink(): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("id")
    .eq("link_type", "universal")
    .eq("status", "active")
    .is("token", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ? { id: String(data.id) } : null;
}

/** Resolve active token by token string or short_slug. */
export async function resolveSourceLinkByToken(
  token: string | null | undefined,
  options?: { includeInactive?: boolean }
): Promise<FacilityReferralSourceLinkRow | null> {
  const t = (token ?? "").trim();
  if (!t) return null;

  const statusFilter = options?.includeInactive ? undefined : "active";

  async function fetchOne(col: "token" | "short_slug") {
    let q = supabaseAdmin.from("facility_referral_source_links").select("*").eq(col, t).limit(1);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data } = await q.maybeSingle();
    return data;
  }

  const byToken = await fetchOne("token");
  if (byToken?.id) return mapTokenLinkRow(byToken as Record<string, unknown>);

  const bySlug = await fetchOne("short_slug");
  if (bySlug?.id) return mapTokenLinkRow(bySlug as Record<string, unknown>);

  return null;
}

export async function recordSourceLinkEvent(input: {
  sourceLinkId?: string | null;
  token?: string | null;
  eventType: SourceLinkEventType;
  facilityId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  salesRepId?: string | null;
  leadId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("facility_referral_source_link_events").insert({
    source_link_id: input.sourceLinkId ?? null,
    token: input.token ?? null,
    event_type: input.eventType,
    facility_id: input.facilityId ?? null,
    contact_id: input.contactId ?? null,
    campaign_id: input.campaignId ?? null,
    sales_rep_id: input.salesRepId ?? null,
    lead_id: input.leadId ?? null,
    ip_hash: input.ipHash ?? null,
    user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    referrer: input.referrer ? input.referrer.slice(0, 500) : null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("[facility-referral-source-links] event:", error.message);
    return;
  }

  if (input.sourceLinkId && UUID_RE.test(input.sourceLinkId)) {
    const { data: link } = await supabaseAdmin
      .from("facility_referral_source_links")
      .select("use_count")
      .eq("id", input.sourceLinkId)
      .maybeSingle();

    const prev = typeof link?.use_count === "number" ? link.use_count : 0;
    await supabaseAdmin
      .from("facility_referral_source_links")
      .update({
        use_count: prev + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", input.sourceLinkId);
  }
}

export async function countRecentSubmissionsByIpHash(
  ipHash: string,
  windowMinutes = 60
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("facility_referral_source_link_events")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("event_type", "form_submitted")
    .gte("created_at", since);

  return count ?? 0;
}

export type GetOrCreatePacketReferralLinkOptions = {
  material_ids?: string[];
  delivery_method?: string | null;
  created_by?: string | null;
};

export type PacketReferralSourceLinkResult =
  | {
      ok: true;
      link: FacilityReferralSourceLinkRow;
      public_path: string;
      public_url: string;
      token_segment: string;
    }
  | { ok: false; error: string };

async function resolveCampaignEnrollmentId(
  row: Record<string, unknown>
): Promise<string | null> {
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const fromMeta = (meta as Record<string, unknown>).campaign_enrollment_id;
    if (typeof fromMeta === "string" && UUID_RE.test(fromMeta)) return fromMeta;
  }
  const stepId = typeof row.campaign_step_instance_id === "string" ? row.campaign_step_instance_id : null;
  if (!stepId || !UUID_RE.test(stepId)) return null;
  const { data: step } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("campaign_enrollment_id")
    .eq("id", stepId)
    .maybeSingle();
  const enrollmentId = (step as { campaign_enrollment_id?: string | null } | null)?.campaign_enrollment_id;
  return typeof enrollmentId === "string" && UUID_RE.test(enrollmentId) ? enrollmentId : null;
}

/** Idempotent: one active packet link per packet request. */
export async function getOrCreatePacketReferralSourceLink(
  packetRequestId: string,
  options?: GetOrCreatePacketReferralLinkOptions
): Promise<PacketReferralSourceLinkResult> {
  if (!UUID_RE.test(packetRequestId)) {
    return { ok: false, error: "invalid_packet_request_id" };
  }

  const { data: existing } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("*")
    .eq("packet_request_id", packetRequestId)
    .eq("link_type", "packet")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const link = mapTokenLinkRow(existing as Record<string, unknown>);
    const segment = publicTokenSegment(link);
    if (!segment) return { ok: false, error: "link_missing_token" };
    return {
      ok: true,
      link,
      token_segment: segment,
      public_path: buildReferralTokenPublicPath(segment),
      public_url: buildReferralTokenPublicUrl(segment),
    };
  }

  const { data: packetRow, error: loadErr } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("*")
    .eq("id", packetRequestId)
    .maybeSingle();

  if (loadErr || !packetRow?.id) {
    return { ok: false, error: "packet_request_not_found" };
  }

  const row = packetRow as Record<string, unknown>;
  const facilityId = typeof row.facility_id === "string" ? row.facility_id : null;
  const contactId = typeof row.contact_id === "string" ? row.contact_id : null;
  const campaignId = typeof row.campaign_id === "string" ? row.campaign_id : null;
  const campaignEnrollmentId = await resolveCampaignEnrollmentId(row);
  const salesRepId =
    (typeof row.assigned_to === "string" ? row.assigned_to : null) ??
    (typeof row.requested_by_user_id === "string" ? row.requested_by_user_id : null);

  const materialIds = [...new Set(options?.material_ids ?? (Array.isArray(row.material_ids) ? (row.material_ids as string[]) : []))].filter(
    (id) => UUID_RE.test(id)
  );
  const primaryMaterialId = materialIds.length === 1 ? materialIds[0]! : materialIds[0] ?? null;
  const deliveryMethod = (options?.delivery_method ?? row.delivery_method ?? "").trim() || null;

  let facilityName = "Facility";
  if (facilityId) {
    const { data: facility } = await supabaseAdmin.from("facilities").select("name").eq("id", facilityId).maybeSingle();
    facilityName = String((facility as { name?: string } | null)?.name ?? facilityName);
  }

  const label = `Packet referral · ${facilityName}`;
  const token = generateReferralToken(16);
  const metadata: Record<string, unknown> = {
    packet_material_ids: materialIds,
    delivery_method: deliveryMethod,
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: created, error: createErr } = await supabaseAdmin
      .from("facility_referral_source_links")
      .insert({
        token,
        link_type: "packet",
        label,
        facility_id: facilityId,
        contact_id: contactId,
        campaign_id: campaignId,
        campaign_enrollment_id: campaignEnrollmentId,
        packet_request_id: packetRequestId,
        packet_material_id: primaryMaterialId,
        sales_rep_id: salesRepId,
        default_source: "packet_link",
        destination_url: buildReferralTokenPublicPath(token),
        status: "active",
        created_by: options?.created_by && UUID_RE.test(options.created_by) ? options.created_by : null,
        metadata,
      })
      .select("*")
      .single();

    if (!createErr && created?.id) {
      const link = mapTokenLinkRow(created as Record<string, unknown>);
      const segment = publicTokenSegment(link) ?? token;
      return {
        ok: true,
        link,
        token_segment: segment,
        public_path: buildReferralTokenPublicPath(segment),
        public_url: buildReferralTokenPublicUrl(segment),
      };
    }

    if (createErr?.code === "23505" || createErr?.message?.includes("duplicate")) {
      const { data: raced } = await supabaseAdmin
        .from("facility_referral_source_links")
        .select("*")
        .eq("packet_request_id", packetRequestId)
        .eq("link_type", "packet")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (raced?.id) {
        const link = mapTokenLinkRow(raced as Record<string, unknown>);
        const segment = publicTokenSegment(link);
        if (segment) {
          return {
            ok: true,
            link,
            token_segment: segment,
            public_path: buildReferralTokenPublicPath(segment),
            public_url: buildReferralTokenPublicUrl(segment),
          };
        }
      }
    }

    if (attempt === 4) {
      console.warn("[facility-referral-source-links] packet link create:", createErr?.message);
      return { ok: false, error: "create_failed" };
    }
  }

  return { ok: false, error: "create_failed" };
}

export type PacketReferralLinkStats = {
  source_link_id: string;
  public_url: string;
  token_segment: string;
  view_count: number;
  leads_count: number;
  last_used_at: string | null;
  last_referral_at: string | null;
  delivery_method: string | null;
};

export async function loadPacketReferralLinkStatsByRequestIds(
  packetRequestIds: string[]
): Promise<Map<string, PacketReferralLinkStats>> {
  const out = new Map<string, PacketReferralLinkStats>();
  const ids = packetRequestIds.filter((id) => UUID_RE.test(id));
  if (!ids.length) return out;

  const { data: links } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("*")
    .in("packet_request_id", ids)
    .eq("link_type", "packet")
    .eq("status", "active");

  if (!links?.length) return out;

  const linkRows = links.map((r) => mapTokenLinkRow(r as Record<string, unknown>));
  const linkIds = linkRows.map((l) => l.id);

  const { data: events } = await supabaseAdmin
    .from("facility_referral_source_link_events")
    .select("source_link_id, event_type, created_at")
    .in("source_link_id", linkIds)
    .limit(10000);

  const statsByLink = new Map<string, { views: number; leads: number; lastLeadAt: string | null }>();
  for (const e of events ?? []) {
    const linkId = String((e as { source_link_id?: string }).source_link_id ?? "");
    if (!linkId) continue;
    const prev = statsByLink.get(linkId) ?? { views: 0, leads: 0, lastLeadAt: null };
    const type = String((e as { event_type?: string }).event_type ?? "");
    const createdAt = String((e as { created_at?: string }).created_at ?? "");
    if (type === "view") prev.views++;
    if (type === "lead_created") {
      prev.leads++;
      if (createdAt && (!prev.lastLeadAt || createdAt > prev.lastLeadAt)) prev.lastLeadAt = createdAt;
    }
    statsByLink.set(linkId, prev);
  }

  for (const link of linkRows) {
    const packetRequestId = link.packet_request_id;
    const segment = publicTokenSegment(link);
    if (!packetRequestId || !segment) continue;
    const s = statsByLink.get(link.id) ?? { views: 0, leads: 0, lastLeadAt: null };
    const deliveryMethod =
      typeof link.metadata?.delivery_method === "string" ? link.metadata.delivery_method : null;
    out.set(packetRequestId, {
      source_link_id: link.id,
      public_url: buildReferralTokenPublicUrl(segment),
      token_segment: segment,
      view_count: s.views,
      leads_count: s.leads,
      last_used_at: link.last_used_at,
      last_referral_at: s.lastLeadAt,
      delivery_method: deliveryMethod,
    });
  }

  return out;
}

export async function appendPacketRequestReferralLead(
  packetRequestId: string,
  leadId: string
): Promise<void> {
  if (!UUID_RE.test(packetRequestId) || !UUID_RE.test(leadId)) return;

  const { data: pr } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("metadata")
    .eq("id", packetRequestId)
    .maybeSingle();

  if (!pr) return;

  const meta =
    pr.metadata && typeof pr.metadata === "object" && !Array.isArray(pr.metadata)
      ? (pr.metadata as Record<string, unknown>)
      : {};
  const existing = Array.isArray(meta.referral_lead_ids)
    ? (meta.referral_lead_ids as string[]).filter((id) => typeof id === "string")
    : [];
  if (!existing.includes(leadId)) existing.push(leadId);

  const { error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      metadata: {
        ...meta,
        referral_lead_ids: existing,
        last_referral_from_packet_at: new Date().toISOString(),
      },
    })
    .eq("id", packetRequestId);

  if (error) {
    console.warn("[facility-referral-source-links] packet request referral metadata:", error.message);
  }
}
