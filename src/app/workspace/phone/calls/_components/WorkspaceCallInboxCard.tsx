import { WorkspaceCallInboxActions } from "./WorkspaceCallInboxActions";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

export type CallInboxRow = {
  id: string;
  created_at: string | null;
  direction: string | null;
  from_e164: string | null;
  to_e164: string | null;
  status: string | null;
  contact_id: string | null;
  contacts?: unknown;
};

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

function callbackNumber(direction: string | null, from: string | null, to: string | null): string | null {
  const dir = (direction ?? "").trim().toLowerCase();
  const f = (from ?? "").trim();
  const t = (to ?? "").trim();
  if (dir === "outbound") return t || null;
  return f || null;
}

type Props = {
  row: CallInboxRow;
  variant: "missed" | "recent";
  patientId: string | null;
};

export function WorkspaceCallInboxCard({ row, variant, patientId }: Props) {
  const dir = String(row.direction ?? "").toLowerCase();
  const label = crmDisplayNameFromContactsRaw(row.contacts);
  const when = formatAdminPhoneWhen(typeof row.created_at === "string" ? row.created_at : null);
  const numRaw = callbackNumber(row.direction, row.from_e164, row.to_e164);
  const numberDisplay = numRaw ? formatPhoneForDisplay(numRaw) : "—";
  const cid = typeof row.contact_id === "string" ? row.contact_id : "";
  const title = label ?? numberDisplay;
  const missed = variant === "missed";

  const shell =
    missed
      ? "border-rose-200/90 bg-gradient-to-br from-rose-50/95 to-white shadow-rose-100/50"
      : "border-slate-200/80 bg-white shadow-slate-200/40";

  return (
    <li className={`rounded-2xl border p-4 shadow-sm ${shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-base font-semibold ${missed ? "text-rose-950" : "text-slate-900"}`}>{title}</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-slate-600">{numberDisplay}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              missed ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {missed ? "Missed" : dir === "inbound" ? "Inbound" : dir === "outbound" ? "Outbound" : "Call"}
          </span>
          <span className="text-[11px] font-medium text-slate-500">{when}</span>
        </div>
      </div>
      <WorkspaceCallInboxActions callbackE164={numRaw} contactId={cid || null} patientId={patientId} />
    </li>
  );
}
