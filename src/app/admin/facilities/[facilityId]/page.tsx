import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FacilityDueBadge } from "@/app/admin/facilities/_components/FacilityDueBadge";
import { FacilityDetailInteractive } from "@/app/admin/facilities/_components/FacilityDetailInteractive";
import { FacilityFollowUpForm } from "@/app/admin/facilities/_components/FacilityFollowUpForm";
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
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

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
  staff_user_id: string | null;
  materials_dropped_off: boolean;
  got_business_card: boolean;
  requested_packet: boolean;
  referral_process_captured: boolean;
};

export default async function AdminFacilityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
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
  const openVisit = one("visit").trim() === "1";

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

  const addr = buildFacilityFullAddress(F);
  const mapsUrl = googleMapsSearchUrlForAddress(addr);
  const activityAtDefaultIso = new Date().toISOString();

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
          <Link href="/admin/facilities" className={crmPrimaryCtaCls}>
            All facilities
          </Link>
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

      <FacilityDetailInteractive
        facilityId={F.id}
        mapsUrl={mapsUrl}
        mainPhone={F.main_phone}
        contacts={contacts}
        activityAtDefaultIso={activityAtDefaultIso}
        openVisitOnMount={openVisit}
      >
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

      <LeadSectionCard id="activity" title="Activity history" description="Visits, calls, and touches — newest first.">
        {activities.length === 0 ? (
          <p className="text-sm text-slate-600">
            No activity logged yet. Use <span className="font-semibold text-slate-800">Add visit</span> to capture your first touch.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Rep</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activities.map((a) => {
                  const repAct = a.staff_user_id ? staffById[a.staff_user_id] : null;
                  const flags = [
                    a.materials_dropped_off ? "Materials" : null,
                    a.got_business_card ? "Card" : null,
                    a.requested_packet ? "Packet" : null,
                    a.referral_process_captured ? "Process" : null,
                  ].filter(Boolean);
                  return (
                    <tr key={a.id} className="bg-white/80">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                        {formatFacilityDateTime(a.activity_at)}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-900">{a.activity_type}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{a.outcome ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{repAct ? staffPrimaryLabel(repAct) : "—"}</td>
                      <td className="max-w-[min(28rem,50vw)] px-4 py-3 text-xs text-slate-700">
                        <span className="line-clamp-4 whitespace-pre-wrap">{a.notes?.trim() || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600">{flags.length ? flags.join(", ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
    </div>
  );
}
