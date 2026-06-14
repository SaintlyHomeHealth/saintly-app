import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FacilityReferralAttributionSection } from "@/app/admin/facilities/_components/FacilityReferralAttributionSection";
import { FacilityReferralProfilePanel } from "@/app/admin/facilities/_components/FacilityReferralProfilePanel";
import { FacilityCampaignsSection } from "@/app/admin/facilities/_components/FacilityCampaignsSection";
import { FacilityPacketRequestsSection } from "@/app/admin/facilities/_components/FacilityPacketRequestsSection";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { FacilityActivityHistoryPanel } from "@/app/admin/facilities/_components/FacilityActivityHistoryPanel";
import { FacilityDueBadge } from "@/app/admin/facilities/_components/FacilityDueBadge";
import { FacilityDetailInteractive } from "@/app/admin/facilities/_components/FacilityDetailInteractive";
import { FacilityFollowUpForm } from "@/app/admin/facilities/_components/FacilityFollowUpForm";
import { FacilityFollowUpTasksSection } from "@/app/admin/facilities/_components/FacilityFollowUpTasksSection";
import { FacilityOutreachInsightPanel } from "@/app/admin/facilities/_components/FacilityOutreachInsightPanel";
import { LeadSectionCard } from "@/app/admin/crm/leads/_components/LeadSectionCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { buildFacilityFullAddress, formatFacilityDate, formatFacilityDateTime, googleMapsSearchUrlForAddress } from "@/lib/crm/facility-address";
import { formatVisitFrequencyLabel } from "@/lib/crm/facility-options";
import {
  computeFacilityDueInfo,
  formatDueYmdAsDisplay,
  formatRelationshipStrengthDots,
} from "@/lib/crm/facility-territory-due";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { supabaseAdmin } from "@/lib/admin";
import { loadFacilityOutreachInsight } from "@/lib/crm/facility-analytics";
import { loadFacilityReferralProfile } from "@/lib/crm/facility-referral-profile";
import { loadFacilityReferralAttribution } from "@/lib/crm/facility-referral-lead";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type FacilityRow = Record<string, unknown> & {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  territory: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  main_phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  assigned_rep_user_id: string | null;
  referral_method: string | null;
  referral_notes: string | null;
  intake_notes: string | null;
  best_time_to_visit: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  visit_frequency: string | null;
  relationship_strength: number | null;
  general_notes: string | null;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  outcome: string | null;
  activity_at: string;
  notes: string | null;
  next_follow_up_at: string | null;
  referral_potential: string | null;
  staff_user_id: string | null;
  materials_dropped_off: boolean;
  got_business_card: boolean;
  requested_packet: boolean;
  referral_process_captured: boolean;
  decision_maker_met?: boolean;
};

export default async function AdminFacilityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const { facilityId } = await params;
  if (!facilityId?.trim()) {
    notFound();
  }

  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };
  const openQuickLog = one("visit").trim() === "1";
  const openAdvanced = one("advanced").trim() === "1";

  const { data: facility, error: fErr } = await supabaseAdmin
    .from("facilities")
    .select("*")
    .eq("id", facilityId.trim())
    .maybeSingle();

  if (fErr || !facility?.id) {
    notFound();
  }

  const F = facility as unknown as FacilityRow;

  const due = computeFacilityDueInfo({
    last_visit_at: F.last_visit_at,
    next_follow_up_at: F.next_follow_up_at,
    visit_frequency: F.visit_frequency,
  });

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as { user_id: string; email: string | null; full_name: string | null }[];
  const rep = F.assigned_rep_user_id ? staffOptions.find((s) => s.user_id === F.assigned_rep_user_id) : null;

  const { data: contactRows } = await supabaseAdmin
    .from("facility_contacts")
    .select("*")
    .eq("facility_id", F.id)
    .eq("is_active", true)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const contacts =
    (contactRows ?? []) as {
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
      department: string | null;
      direct_phone: string | null;
      mobile_phone: string | null;
      fax: string | null;
      email: string | null;
      preferred_contact_method: string | null;
      best_time_to_reach: string | null;
      is_decision_maker: boolean;
      influence_level: string | null;
      notes: string | null;
      is_best_contact?: boolean;
      is_gatekeeper?: boolean;
      is_referral_contact?: boolean;
    }[];

  const { data: activityRows } = await supabaseAdmin
    .from("facility_activities")
    .select("*")
    .eq("facility_id", F.id)
    .order("activity_at", { ascending: false })
    .limit(100);

  const activities = (activityRows ?? []) as ActivityRow[];

  const staffById: Record<string, (typeof staffOptions)[number]> = {};
  for (const s of staffOptions) {
    staffById[s.user_id] = s;
  }

  const { data: photoRows } = await supabaseAdmin
    .from("facility_activity_photos")
    .select("id, activity_id, photo_type, ai_summary, created_at")
    .eq("facility_id", F.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const allPhotos = (photoRows ?? []) as {
    id: string;
    activity_id: string | null;
    photo_type: string | null;
    ai_summary: string | null;
    created_at: string;
  }[];

  const photosByActivity: Record<string, typeof allPhotos> = {};
  for (const p of allPhotos) {
    if (!p.activity_id) continue;
    if (!photosByActivity[p.activity_id]) photosByActivity[p.activity_id] = [];
    photosByActivity[p.activity_id].push(p);
  }

  const activityHistoryRows = activities.map((a) => {
    const repAct = a.staff_user_id ? staffById[a.staff_user_id] : null;
    const flags = [
      a.materials_dropped_off ? "Materials" : null,
      a.got_business_card ? "Card" : null,
      a.requested_packet ? "Packet" : null,
      a.referral_process_captured ? "Process" : null,
      a.decision_maker_met ? "Decision maker" : null,
    ].filter(Boolean) as string[];
    return {
      id: a.id,
      activity_type: a.activity_type,
      outcome: a.outcome,
      activity_at: a.activity_at,
      notes: a.notes,
      next_follow_up_at: a.next_follow_up_at,
      referral_potential: a.referral_potential,
      repLabel: repAct ? staffPrimaryLabel(repAct) : "—",
      flags,
      summary: [a.activity_type, a.outcome].filter(Boolean).join(" · "),
      whenLabel: formatFacilityDateTime(a.activity_at),
      followUpLabel: a.next_follow_up_at ? formatFacilityDate(a.next_follow_up_at) : null,
    };
  });

  const addr = buildFacilityFullAddress(F);
  const mapsUrl = googleMapsSearchUrlForAddress(addr);
  const activityAtDefaultIso = new Date().toISOString();
  const outreachInsight = await loadFacilityOutreachInsight(supabaseAdmin, F.id);
  const staffByIdMap = new Map(
    staffOptions.map((s) => [s.user_id, { full_name: s.full_name, email: s.email }])
  );
  const referralAttribution = await loadFacilityReferralAttribution(F.id, staffByIdMap);
  const referralProfile = await loadFacilityReferralProfile(F.id);
  const contactOptions = contacts.map((c) => ({
    id: c.id,
    name:
      (c.full_name ?? "").trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      "Contact",
  }));
  const staffSelectOptions = staffOptions.map((s) => ({
    user_id: s.user_id,
    label: staffPrimaryLabel(s),
  }));

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Facility"
        title={F.name}
        metaLine={[F.type, F.city].filter(Boolean).join(" · ") || undefined}
        description={
          addr ? (
            <span className="text-slate-700">{addr}</span>
          ) : (
            <span className="text-slate-500">Add a street address to enable one-tap directions.</span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ReferralsNavLink />
            <Link href="/admin/facilities" className={crmPrimaryCtaCls}>
              All facilities
            </Link>
          </div>
        }
      />

      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-md shadow-slate-200/25 ring-1 ring-sky-100/50">
        <div className="bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/40 px-5 py-5 sm:px-8 sm:py-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Status</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{F.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Priority</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{F.priority}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Main phone</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {F.main_phone ? formatPhoneForDisplay(F.main_phone) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Fax</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {F.fax ? formatPhoneForDisplay(F.fax) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Assigned rep</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{rep ? staffPrimaryLabel(rep) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Last visit</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatFacilityDate(F.last_visit_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Visit cadence</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatVisitFrequencyLabel(F.visit_frequency)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Relationship</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatRelationshipStrengthDots(F.relationship_strength)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Next follow-up (scheduled)</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatFacilityDateTime(F.next_follow_up_at)}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Next due (visit)</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <FacilityDueBadge band={due.band} />
                <span className="text-sm font-semibold text-slate-900">{formatDueYmdAsDisplay(due.effectiveNextDueYmd)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {due.effectiveNextDueYmd
                  ? due.usesExplicitFollowUp
                    ? "Uses the scheduled follow-up date."
                    : "From last visit + cadence (no follow-up date set)."
                  : "Set a follow-up or log a visit with cadence to see a due date."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <FacilityReferralProfilePanel
        facilityId={F.id}
        facilityName={F.name}
        initialSummary={referralProfile}
        contacts={contactOptions}
        canEdit={canAccessFacilityFieldTools(staff)}
      />

      <FacilityCampaignsSection
        facilityId={F.id}
        facilityName={F.name}
        canManage={isManagerOrHigher(staff)}
      />

      <FacilityPacketRequestsSection
        facilityId={F.id}
        facilityName={F.name}
        contacts={contactOptions}
        staffOptions={staffSelectOptions}
        defaultAssignedTo={F.assigned_rep_user_id}
        canManage={canAccessFacilityFieldTools(staff)}
      />

      <FacilityDetailInteractive
        facilityId={F.id}
        facilityName={F.name}
        mapsUrl={mapsUrl}
        mainPhone={F.main_phone}
        contacts={contacts}
        activityAtDefaultIso={activityAtDefaultIso}
        openQuickLogOnMount={openQuickLog}
        openAdvancedOnMount={openAdvanced}
        staffOptions={staffSelectOptions}
        defaultRepId={F.assigned_rep_user_id}
        contactOptions={contactOptions}
      >
        <FacilityOutreachInsightPanel insight={outreachInsight} />
        <LeadSectionCard
          id="overview"
          title="Overview"
          description="Territory, digital presence, and quick context for the team."
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Territory</dt>
              <dd className="mt-1 text-sm text-slate-800">{F.territory?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="mt-1 text-sm text-slate-800">{F.email?.trim() || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Website</dt>
              <dd className="mt-1 text-sm text-slate-800 break-all">
                {F.website?.trim() ? (
                  <a
                    href={F.website.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                  >
                    {F.website.trim()}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Referral method</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{F.referral_method?.trim() || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">General notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{F.general_notes?.trim() || "—"}</dd>
            </div>
          </dl>
        </LeadSectionCard>
      </FacilityDetailInteractive>

      <LeadSectionCard
        id="referral-attribution"
        title="Referral attribution"
        description="Track CRM leads and conversions from this referral source."
      >
        <FacilityReferralAttributionSection
          facilityId={F.id}
          facilityName={F.name}
          attribution={referralAttribution}
          contacts={contactOptions}
          staffOptions={staffSelectOptions}
          defaultRepId={F.assigned_rep_user_id}
        />
      </LeadSectionCard>

      <LeadSectionCard id="activity" title="Activity history" description="Visits, calls, and touches — newest first.">
        <FacilityActivityHistoryPanel
          facilityId={F.id}
          facilityName={F.name}
          contacts={contactOptions}
          staffOptions={staffSelectOptions}
          defaultRepId={F.assigned_rep_user_id}
          activities={activityHistoryRows}
          photosByActivity={photosByActivity}
          recentPhotos={allPhotos}
          formatPhotoDate={(iso) => formatFacilityDate(iso)}
        />
      </LeadSectionCard>

      <LeadSectionCard
        id="referral-intake"
        title="Referral notes & intake notes"
        description="Instructions your team needs when a referral comes from this source."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Referral notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {F.referral_notes?.trim() || "—"}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Intake notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {F.intake_notes?.trim() || "—"}
            </p>
          </div>
        </div>
      </LeadSectionCard>

      <LeadSectionCard
        id="follow-up"
        title="Follow-up"
        description="Keep the next touch visible for routing and field planning."
      >
        <FacilityFollowUpForm
          facilityId={F.id}
          nextFollowUpIso={F.next_follow_up_at}
          bestTimeToVisit={F.best_time_to_visit}
        />
      </LeadSectionCard>

      <FacilityFollowUpTasksSection
        facilityId={F.id}
        facilityName={F.name}
        contacts={contacts.map((c) => ({
          id: c.id,
          name:
            (c.full_name ?? "").trim() ||
            [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
            "Contact",
        }))}
        staffOptions={staffOptions.map((s) => ({
          user_id: s.user_id,
          label: staffPrimaryLabel(s),
        }))}
        defaultAssignedTo={F.assigned_rep_user_id}
      />
    </div>
  );
}
