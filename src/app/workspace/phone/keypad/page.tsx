import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { KeypadOutboundDialSection } from "./KeypadOutboundDialSection";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { fallbackPathAfterKeypadDenied, resolveEffectivePageAccess } from "@/lib/staff-page-access";
import {
  canAccessWorkspacePhone,
  canUseWorkspacePhoneAppShell,
  getStaffProfile,
} from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function oneParam(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

function KeypadDialSuspenseFallback() {
  return (
    <div
      className="mt-1 flex min-h-0 w-full shrink-0 flex-col gap-3 sm:mt-3 lg:mx-auto lg:max-w-[min(100%,60rem)] lg:flex-row lg:items-start lg:justify-center lg:gap-8"
      aria-busy="true"
      aria-label="Loading keypad"
    >
      <div className="flex w-full max-w-[560px] shrink-0 flex-col p-0 sm:rounded-2xl sm:border sm:border-sky-100/60 sm:bg-white sm:p-5 sm:shadow-sm lg:max-w-[620px] lg:p-4 lg:shadow-[0_8px_30px_-12px_rgba(30,58,138,0.08)]">
        <div className="flex aspect-[4/5] max-h-[520px] min-h-[280px] w-full animate-pulse flex-col rounded-2xl bg-slate-100/90 sm:aspect-auto sm:min-h-[420px]" />
      </div>
      <aside className="hidden w-full max-w-[320px] shrink-0 rounded-2xl border border-sky-100/70 bg-gradient-to-b from-white to-sky-50/35 p-5 lg:block lg:w-[320px] lg:flex-none lg:p-4">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200/80" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        </div>
      </aside>
    </div>
  );
}

export default async function WorkspaceKeypadPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfStart = routePerfStart();
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/login");
  }
  if (!canUseWorkspacePhoneAppShell(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  const access = resolveEffectivePageAccess(staff);
  if (!access.workspace_keypad) {
    redirect(fallbackPathAfterKeypadDenied(access));
  }

  const telephonyOk = canAccessWorkspacePhone(staff);

  const sp = searchParams ? await searchParams : {};
  const dial = (oneParam(sp, "dial") || oneParam(sp, "number")).trim();
  const placeRaw = oneParam(sp, "place").trim().toLowerCase();
  const autoPlaceCall = placeRaw === "1" || placeRaw === "true" || placeRaw === "yes";
  const leadId = oneParam(sp, "leadId").trim();
  const contactId = oneParam(sp, "contactId").trim();
  const contextName = oneParam(sp, "contextName").trim() || oneParam(sp, "name").trim();
  const candidateId = oneParam(sp, "candidateId").trim();
  const source = oneParam(sp, "source").trim().toLowerCase();

  const staffDisplayName =
    staff.full_name?.trim() ||
    staff.email?.trim() ||
    `${staff.role.replace(/_/g, " ")} (${staff.user_id.slice(0, 8)}…)`;

  const dialerKey = `kp-${dial}-${autoPlaceCall ? "1" : "0"}-${candidateId || ""}-${source || ""}`;

  if (perfStart) {
    routePerfLog("workspace/phone/keypad", perfStart);
  }

  return (
    <div className="ws-phone-page-shell flex min-h-0 shrink-0 flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-4 lg:px-8">
      <WorkspacePhonePageHeader title="Keypad" />
      {!telephonyOk ? (
        <div className="mt-4 rounded-2xl border border-amber-200/90 bg-amber-50/95 px-4 py-4 text-sm text-amber-950">
          <p className="font-semibold">Phone access is off</p>
          <p className="mt-2 leading-relaxed text-amber-900/95">
            You do not have phone access enabled. Contact an administrator to turn on Staff Access → Phone
            permissions.
          </p>
        </div>
      ) : null}
      {leadId && UUID_RE.test(leadId) ? (
        <p className="mt-2 rounded-2xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 text-sm text-sky-950">
          CRM lead:{" "}
          <Link href={`/admin/crm/leads/${leadId}`} className="font-semibold underline-offset-2 hover:underline">
            Open lead record
          </Link>
          {contextName ? <span className="text-sky-800"> · {contextName}</span> : null}
          {contactId && UUID_RE.test(contactId) ? (
            <span className="mt-1 block font-mono text-[10px] text-sky-700/90">Contact {contactId}</span>
          ) : null}
        </p>
      ) : null}
      {source === "recruiting" && candidateId && UUID_RE.test(candidateId) ? (
        <p className="mt-2 rounded-2xl border border-violet-200/80 bg-violet-50/90 px-4 py-3 text-sm text-violet-950">
          Recruiting:{" "}
          <Link
            href={`/admin/recruiting/${candidateId}`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            Open recruit record
          </Link>
          {contextName ? <span className="text-violet-900"> · {contextName}</span> : null}
          {contactId && UUID_RE.test(contactId) ? (
            <span className="mt-1 block font-mono text-[10px] text-violet-800/90">Contact {contactId}</span>
          ) : null}
        </p>
      ) : null}
      {!telephonyOk ? null : (
        <Suspense fallback={<KeypadDialSuspenseFallback />}>
          <KeypadOutboundDialSection
            staff={staff}
            staffDisplayName={staffDisplayName}
            dialerKey={dialerKey}
            initialDigits={dial || undefined}
            autoPlaceCall={autoPlaceCall && Boolean(dial)}
          />
        </Suspense>
      )}
    </div>
  );
}
