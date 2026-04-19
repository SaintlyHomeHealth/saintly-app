import Link from "next/link";
import { redirect } from "next/navigation";

import { KeypadDialerLazy } from "./KeypadDialerLazy";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function oneParam(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

export default async function WorkspaceKeypadPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfStart = routePerfStart();
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

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
    <div className="ws-phone-page-shell flex flex-1 flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-4 sm:pt-6 lg:px-8">
      <WorkspacePhonePageHeader
        title="Keypad"
        subtitle={
          <span className="hidden text-xs leading-snug text-slate-600 sm:inline">
            Saintly Home Health — use your assigned line for outbound calls.
          </span>
        }
      />
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
      <div className="mt-2 flex flex-1 flex-col items-stretch gap-3 sm:mt-6 sm:gap-6 lg:mt-8 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
        <div className="w-full max-w-md shrink-0 p-0 sm:rounded-[32px] sm:border sm:border-sky-100/60 sm:bg-gradient-to-b sm:from-white sm:via-white sm:to-sky-50/40 sm:p-7 sm:shadow-[0_12px_40px_-12px_rgba(30,58,138,0.1),0_4px_16px_-8px_rgba(15,23,42,0.06)] lg:max-w-lg">
          <KeypadDialerLazy
            key={dialerKey}
            staffDisplayName={staffDisplayName}
            variant="keypad"
            initialDigits={dial || undefined}
            autoPlaceCall={autoPlaceCall && Boolean(dial)}
          />
        </div>
        <aside className="hidden max-w-sm flex-1 rounded-2xl border border-sky-100/70 bg-gradient-to-b from-white to-sky-50/35 p-5 text-sm text-slate-600 shadow-sm shadow-sky-100/40 lg:block">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tips</p>
          <ul className="mt-3 list-inside list-disc space-y-2 leading-relaxed">
            <li>Tap a number on the pad once to unlock ringtone audio on mobile browsers.</li>
            <li>Use the large blue Call button — it stays easy to hit while you are moving.</li>
            <li>Patient and lead actions elsewhere can deep-link you here with a number ready to dial.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
