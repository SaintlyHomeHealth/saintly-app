"use client";

import Link from "next/link";

import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { AnalyticsNavLink } from "@/app/admin/facilities/_components/AnalyticsNavLink";
import { CampaignsNavLink } from "@/app/admin/facilities/_components/CampaignsNavLink";
import { PacketsNavLink } from "@/app/admin/facilities/_components/PacketsNavLink";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { PlaybooksNavLink } from "@/app/admin/facilities/_components/PlaybooksNavLink";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { RouteBuilderNavLink } from "@/app/admin/facilities/_components/RouteBuilderNavLink";
import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

const cardCls =
  "flex min-h-[4.5rem] flex-col justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/40";
const cardPrimaryCls =
  "flex min-h-[4.5rem] flex-col justify-center rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-3 shadow-sm transition hover:border-teal-300 hover:bg-teal-50";
const cardFieldCls =
  "flex min-h-[4.5rem] flex-col justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50";

type FacilitiesHubCardsProps = {
  showAdminTools?: boolean;
};

export function FacilitiesHubCards({ showAdminTools = true }: FacilitiesHubCardsProps) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Primary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/facilities/field" className={`${cardFieldCls} border-emerald-600 bg-emerald-600 hover:border-emerald-700 hover:bg-emerald-700`}>
            <span className="text-sm font-semibold text-white">Field Mode</span>
            <span className="mt-0.5 text-xs text-emerald-100">Work today&apos;s route from your phone</span>
          </Link>
          <OutreachNavLink className={cardPrimaryCls} />
          <ReferralsNavLink className={cardCls.replace("border-slate-200", "border-violet-200").replace("hover:border-sky-200", "hover:border-violet-300")} />
          <Link href="/admin/facilities/source-links" className={cardCls.replace("border-slate-200", "border-amber-200").replace("hover:border-sky-200", "hover:border-amber-300")}>
            <span className="text-sm font-semibold text-slate-900">Referral Links & QR</span>
            <span className="mt-0.5 text-xs text-slate-600">Campaign, rep, and facility tracking links</span>
          </Link>
          <SourceReviewNavLink className={cardCls.replace("border-slate-200", "border-orange-200").replace("hover:border-sky-200", "hover:border-orange-300")} />
          <FollowUpNavLink className={cardCls} />
          {showAdminTools ? (
            <AnalyticsNavLink className={cardCls.replace("border-slate-200", "border-indigo-200").replace("hover:border-sky-200", "hover:border-indigo-300")} />
          ) : null}
          <CampaignsNavLink className={cardCls.replace("border-slate-200", "border-pink-200").replace("hover:border-sky-200", "hover:border-pink-300")} />
          <PacketsNavLink className={cardCls.replace("border-slate-200", "border-violet-200").replace("hover:border-sky-200", "hover:border-violet-300")} />
          <RoutesNavLink className={cardCls.replace("border-slate-200", "border-teal-200").replace("hover:border-sky-200", "hover:border-teal-300")} />
          {showAdminTools ? (
            <PlaybooksNavLink className={cardCls.replace("border-slate-200", "border-fuchsia-200").replace("hover:border-sky-200", "hover:border-fuchsia-300")} />
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Field tools</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/facilities/finder" className={cardFieldCls}>
            <span className="text-sm font-semibold text-emerald-950">Find Near Me</span>
            <span className="mt-0.5 text-xs text-emerald-800/80">Search portal facilities near your location</span>
          </Link>
          <Link href="/admin/facilities/discover" className={cardFieldCls.replace("border-emerald-200", "border-violet-200").replace("bg-emerald-50/60", "bg-violet-50/60")}>
            <span className="text-sm font-semibold text-violet-950">Discover</span>
            <span className="mt-0.5 text-xs text-violet-800/80">Find new referral sources via Google Places</span>
          </Link>
          <RouteBuilderNavLink className={cardFieldCls.replace("text-center", "")} />
        </div>
      </section>

      {showAdminTools ? (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Admin</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/admin/facilities?hub=0" className={cardCls}>
              <span className="text-sm font-semibold text-slate-900">Facility List</span>
              <span className="mt-0.5 text-xs text-slate-600">Full admin table with filters</span>
            </Link>
            <Link href="/admin/facilities/new" className={crmPrimaryCtaCls}>
              + Add Facility
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Compact row of field nav links for page headers (sales rep view). */
export function FacilitiesFieldNavRow({ showAnalytics = false }: { showAnalytics?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <FieldModeNavLink />
      <OutreachNavLink />
      <Link
        href="/admin/facilities/finder"
        className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-[20px] border border-emerald-600 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 sm:text-sm"
      >
        Find Near Me
      </Link>
      <Link
        href="/admin/facilities/discover"
        className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-[20px] border border-violet-600 bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 sm:text-sm"
      >
        Discover
      </Link>
      <RouteBuilderNavLink className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-[20px] border border-sky-600 bg-sky-50 px-3 py-2 text-center text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100 sm:text-sm" />
      <FollowUpNavLink className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-[20px] border border-amber-600 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 sm:text-sm" />
      <ReferralsNavLink className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center rounded-[20px] border border-violet-600 bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-950 shadow-sm transition hover:bg-violet-100 sm:text-sm" />
      <CampaignsNavLink />
      <PacketsNavLink />
      <RoutesNavLink />
      {showAnalytics ? <PlaybooksNavLink /> : null}
      {showAnalytics ? <AnalyticsNavLink /> : null}
      <FacilityNotificationBell />
    </div>
  );
}
