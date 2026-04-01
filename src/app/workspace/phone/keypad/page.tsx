import Link from "next/link";
import { redirect } from "next/navigation";

import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
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
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = searchParams ? await searchParams : {};
  const dial = oneParam(sp, "dial").trim();
  const placeRaw = oneParam(sp, "place").trim().toLowerCase();
  const autoPlaceCall = placeRaw === "1" || placeRaw === "true" || placeRaw === "yes";
  const leadId = oneParam(sp, "leadId").trim();
  const contactId = oneParam(sp, "contactId").trim();
  const contextName = oneParam(sp, "contextName").trim();

  const staffDisplayName =
    staff.full_name?.trim() ||
    staff.email?.trim() ||
    `${staff.role.replace(/_/g, " ")} (${staff.user_id.slice(0, 8)}…)`;

  const dialerKey = `kp-${dial}-${autoPlaceCall ? "1" : "0"}`;

  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Keypad</h1>
      <p className="mt-0.5 text-xs text-slate-500">Dial and connect (Twilio softphone)</p>
      {leadId && UUID_RE.test(leadId) ? (
        <p className="mt-2 rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-xs text-sky-950">
          CRM lead:{" "}
          <Link href={`/admin/crm/leads/${leadId}`} className="font-semibold underline-offset-2 hover:underline">
            Open lead record
          </Link>
          {contextName ? <span className="text-sky-800"> · {contextName}</span> : null}
          {contactId && UUID_RE.test(contactId) ? (
            <span className="block font-mono text-[10px] text-sky-700/90">Contact {contactId}</span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-5 flex flex-1 items-start justify-center">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-sm shadow-slate-200/70">
          <SoftphoneDialer
            key={dialerKey}
            staffDisplayName={staffDisplayName}
            variant="keypad"
            initialDigits={dial || undefined}
            autoPlaceCall={autoPlaceCall && Boolean(dial)}
          />
        </div>
      </div>
    </div>
  );
}
