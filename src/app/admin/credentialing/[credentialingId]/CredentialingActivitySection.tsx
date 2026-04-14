import { CredentialingNoteComposer } from "@/components/credentialing/CredentialingNoteComposer";
import { CredentialingTimelinePanel } from "@/components/credentialing/CredentialingTimelinePanel";
import { partitionCredentialingTimeline } from "@/lib/crm/credentialing-timeline";
import { loadCredentialingStaffLabelMap } from "@/lib/crm/credentialing-staff-directory";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARD_SHELL =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

type ActivityRow = {
  id: string;
  activity_type: string;
  summary: string;
  details: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

const ACTIVITY_FETCH_LIMIT = 120;

export async function CredentialingActivitySection({
  credentialingId,
  viewerUserId,
}: {
  credentialingId: string;
  viewerUserId: string;
}) {
  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: rawActivity } = await supabase
    .from("payer_credentialing_activity")
    .select("id, activity_type, summary, details, created_at, created_by_user_id")
    .eq("credentialing_record_id", id)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_FETCH_LIMIT);

  const activities = (rawActivity ?? []) as ActivityRow[];
  const actorIds = activities.map((a) => a.created_by_user_id).filter((x): x is string => Boolean(x));
  const actorLabels = await loadCredentialingStaffLabelMap(actorIds);
  const actorLabelRecord = Object.fromEntries(actorLabels);
  const { conversation: timelineConversation, system: timelineSystem } = partitionCredentialingTimeline(activities);

  const totalShown = timelineConversation.length + timelineSystem.length;

  return (
    <section
      id="credentialing-timeline"
      className={`scroll-mt-28 space-y-3 ${CARD_SHELL} bg-slate-50/80 p-4 sm:p-5`}
    >
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 sm:px-5">
        <label
          className="mb-2 block text-[11px] font-semibold text-slate-700"
          htmlFor={`credentialing-note-${credentialingId}`}
        >
          Add timeline entry
        </label>
        <CredentialingNoteComposer credentialingId={credentialingId} />
      </div>

      <details className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          Activity history
          <span className="ml-2 font-normal text-slate-500">
            ({totalShown} loaded — expand for full thread; system log is optional inside)
          </span>
        </summary>
        <div className={`flex min-h-0 max-h-[min(70vh,40rem)] flex-col overflow-hidden border-t border-slate-100 ${CARD_SHELL} bg-slate-100/80 p-0`}>
          <CredentialingTimelinePanel
            conversation={timelineConversation}
            system={timelineSystem}
            actorLabels={actorLabelRecord}
            viewerUserId={viewerUserId}
          />
        </div>
      </details>
    </section>
  );
}

export function CredentialingActivitySectionFallback() {
  return (
    <section className={`scroll-mt-28 space-y-3 ${CARD_SHELL} bg-slate-50/80 p-4 sm:p-5`}>
      <div className="h-40 animate-pulse rounded-2xl bg-slate-200/60" />
      <div className="h-56 animate-pulse rounded-2xl bg-slate-200/50" />
    </section>
  );
}
