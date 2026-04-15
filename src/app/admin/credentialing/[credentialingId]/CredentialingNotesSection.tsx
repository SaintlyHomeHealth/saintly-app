import { CredentialingNoteComposer } from "@/components/credentialing/CredentialingNoteComposer";
import { PAYER_CREDENTIALING_ACTIVITY_TYPES } from "@/lib/crm/credentialing-activity-types";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import { isCredentialingTimelineNoise } from "@/lib/crm/credentialing-timeline";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

type Row = {
  id: string;
  activity_type: string;
  summary: string;
  details: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

function isSimpleNoteRow(r: Row): boolean {
  const t = r.activity_type.trim();
  if (t === "note" || t === PAYER_CREDENTIALING_ACTIVITY_TYPES.manual_note) return true;
  return false;
}

function bubbleBody(a: Row): string {
  const d = a.details?.trim();
  if (d) return d;
  return (a.summary ?? "").trim() || "—";
}

export async function CredentialingNotesSection({
  credentialingId,
  viewerUserId,
}: {
  credentialingId: string;
  viewerUserId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: raw } = await supabase
    .from("payer_credentialing_activity")
    .select("id, activity_type, summary, details, created_at, created_by_user_id")
    .eq("credentialing_record_id", id)
    .order("created_at", { ascending: false })
    .limit(250);

  const rows = ((raw ?? []) as Row[]).filter((r) => !isCredentialingTimelineNoise(r)).filter(isSimpleNoteRow);
  const chronological = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const actorIds = chronological.map((a) => a.created_by_user_id).filter((x): x is string => Boolean(x));
  const actorLabels = await loadCredentialingStaffLabelMap(actorIds);

  function actorName(userId: string | null): string {
    if (!userId) return "Staff";
    if (userId === viewerUserId) return "You";
    return actorLabels.get(userId) ?? "Staff";
  }

  return (
    <section className={`${CARD_SHELL} flex flex-col overflow-hidden bg-white p-4 sm:p-5`}>
      <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
      <p className="mt-0.5 text-[11px] text-slate-500">Chronological thread — Enter to send a note.</p>

      <div className="mt-4 flex min-h-[12rem] max-h-[min(50vh,24rem)] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/80">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <ul className="mx-auto flex max-w-xl flex-col gap-3">
            {chronological.length === 0 ? (
              <li className="text-center text-sm text-slate-500">No notes yet.</li>
            ) : (
              chronological.map((a) => {
                const when = formatCredentialingDateTime(a.created_at);
                const who = actorName(a.created_by_user_id);
                const body = bubbleBody(a);
                return (
                  <li key={a.id} className="flex w-full flex-col items-end gap-1">
                    <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#007AFF] px-4 py-2.5 text-white shadow-md sm:max-w-[75%]">
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [word-break:break-word]">
                        {body}
                      </p>
                    </div>
                    <div className="flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-0.5 pr-1 text-[11px] text-slate-500 sm:max-w-[75%]">
                      <span className="tabular-nums">{when}</span>
                      <span className="text-slate-400">·</span>
                      <span className={who === "You" ? "font-semibold text-slate-600" : ""}>{who}</span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white px-3 py-3 sm:px-4">
        <CredentialingNoteComposer credentialingId={credentialingId} />
      </div>
    </section>
  );
}

export function CredentialingNotesSectionFallback() {
  return (
    <section className={`${CARD_SHELL} space-y-3 bg-white p-4 sm:p-5`}>
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200/80" />
      <div className="h-40 animate-pulse rounded-2xl bg-slate-100/90" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100/90" />
    </section>
  );
}
