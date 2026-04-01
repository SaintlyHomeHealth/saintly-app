import Link from "next/link";
import { redirect } from "next/navigation";

import { IncomingCallAlertsLive, type IncomingCallAlertRow } from "../incoming-call-alerts-live";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffProfile, hasFullCallVisibility, isPhoneWorkspaceUser } from "@/lib/staff-profile";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }

  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function mapIncomingCallAlertQueryRow(raw: Record<string, unknown>): IncomingCallAlertRow {
  const pcRaw = raw.phone_calls;
  let crm: string | null = null;
  if (pcRaw && typeof pcRaw === "object" && !Array.isArray(pcRaw)) {
    crm = crmDisplayNameFromContactsRaw((pcRaw as { contacts?: unknown }).contacts);
  } else if (Array.isArray(pcRaw) && pcRaw[0] && typeof pcRaw[0] === "object") {
    crm = crmDisplayNameFromContactsRaw((pcRaw[0] as { contacts?: unknown }).contacts);
  }

  return {
    id: String(raw.id),
    phone_call_id: String(raw.phone_call_id),
    external_call_id: String(raw.external_call_id),
    from_e164: typeof raw.from_e164 === "string" ? raw.from_e164 : null,
    to_e164: typeof raw.to_e164 === "string" ? raw.to_e164 : null,
    status: String(raw.status),
    created_at: String(raw.created_at),
    acknowledged_at: typeof raw.acknowledged_at === "string" ? raw.acknowledged_at : null,
    resolved_at: typeof raw.resolved_at === "string" ? raw.resolved_at : null,
    crm_contact_display_name: crm,
  };
}

export default async function AdminPhoneAlertsPage() {
  const staffProfile = await getStaffProfile();
  if (!staffProfile || !isPhoneWorkspaceUser(staffProfile)) {
    redirect("/admin");
  }

  const hasFull = hasFullCallVisibility(staffProfile);
  if (!hasFull) redirect("/admin/phone");

  const supabase = await createServerSupabaseClient();
  const { data: alertRows, error: alertsErr } = await supabase
    .from("incoming_call_alerts")
    .select(
      "id, phone_call_id, external_call_id, from_e164, to_e164, status, created_at, acknowledged_at, resolved_at, phone_calls ( contact_id, contacts ( full_name, first_name, last_name ) )"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const liveAlerts = (alertRows || []).map((r) =>
    mapIncomingCallAlertQueryRow(r as Record<string, unknown>)
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Twilio Programmable Voice
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Incoming call alerts</h1>
        </div>
        <Link
          href="/admin/phone"
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Back to phone calls
        </Link>
      </div>

      {alertsErr ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Could not load incoming_call_alerts: {alertsErr.message}
        </div>
      ) : null}

      {!alertsErr ? <IncomingCallAlertsLive initialAlerts={liveAlerts} maxVisible={50} /> : null}
    </div>
  );
}

