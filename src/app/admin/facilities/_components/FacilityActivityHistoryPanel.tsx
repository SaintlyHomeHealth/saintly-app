"use client";

import { useState } from "react";

import { FacilityReferralLeadModal } from "@/app/admin/facilities/_components/FacilityReferralLeadModal";
import { FacilityPacketRequestModal } from "@/app/admin/facilities/_components/FacilityPacketRequestModal";
import { facilityPhotoTypeLabel } from "@/lib/crm/facility-photos-constants";
import { facilityPhotoFileUrl } from "@/lib/crm/facility-photo-client";
import { isReferralLeadSuggestedOutcome } from "@/lib/crm/facility-referral-lead-client";
import { isPacketRequestSuggestedOutcome } from "@/lib/crm/facility-packet-types";

export type ActivityPhotoRow = {
  id: string;
  activity_id: string | null;
  photo_type: string | null;
  ai_summary: string | null;
  created_at: string;
};

type FacilityActivityHistoryPanelProps = {
  facilityId: string;
  facilityName: string;
  contacts?: { id: string; name: string }[];
  staffOptions?: { user_id: string; label: string }[];
  defaultRepId?: string | null;
  activities: Array<{
    id: string;
    activity_type: string;
    outcome: string | null;
    activity_at: string;
    notes: string | null;
    next_follow_up_at: string | null;
    referral_potential: string | null;
    repLabel: string;
    flags: string[];
    summary: string;
    whenLabel: string;
    followUpLabel: string | null;
  }>;
  photosByActivity: Record<string, ActivityPhotoRow[]>;
  recentPhotos: ActivityPhotoRow[];
  formatPhotoDate: (iso: string) => string;
};

export function FacilityActivityHistoryPanel({
  facilityId,
  facilityName,
  contacts = [],
  staffOptions = [],
  defaultRepId,
  activities,
  photosByActivity,
  recentPhotos,
  formatPhotoDate,
}: FacilityActivityHistoryPanelProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [referralActivityId, setReferralActivityId] = useState<string | null>(null);
  const [packetActivity, setPacketActivity] = useState<{ id: string; outcome: string | null; notes: string | null } | null>(null);

  return (
    <>
      {recentPhotos.length > 0 ? (
        <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Recent photos</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {recentPhotos.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreviewId(p.id)}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={facilityPhotoFileUrl(p.id)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {p.photo_type ? (
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-slate-900/70 px-1 py-0.5 text-[9px] font-semibold text-white">
                    {facilityPhotoTypeLabel(p.photo_type)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activities.length === 0 ? (
        <p className="text-sm text-slate-600">
          No activity logged yet. Use <span className="font-semibold text-slate-800">Quick Log</span> to capture your first touch.
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
                <th className="px-4 py-3">Photos</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((a) => {
                const photos = photosByActivity[a.id] ?? [];
                return (
                  <tr key={a.id} className="bg-white/80">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">{a.whenLabel}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-900">
                      <div>{a.summary}</div>
                      {a.referral_potential ? (
                        <div className="mt-0.5 text-[10px] font-semibold text-violet-800">
                          Potential: {a.referral_potential}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{a.outcome ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{a.repLabel}</td>
                    <td className="max-w-[min(28rem,50vw)] px-4 py-3 text-xs text-slate-700">
                      <span className="line-clamp-4 whitespace-pre-wrap">{a.notes?.trim() || "—"}</span>
                      {a.followUpLabel ? (
                        <div className="mt-1 text-[10px] font-medium text-sky-800">Follow-up: {a.followUpLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {photos.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {photos.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPreviewId(p.id)}
                              className="relative h-10 w-10 overflow-hidden rounded-lg border border-slate-200"
                              title={p.ai_summary ?? facilityPhotoTypeLabel(p.photo_type)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={facilityPhotoFileUrl(p.id)} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      {a.flags.length ? a.flags.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {isReferralLeadSuggestedOutcome(a.outcome) ? (
                          <button
                            type="button"
                            onClick={() => setReferralActivityId(a.id)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Create Referral Lead
                          </button>
                        ) : null}
                        {a.flags.includes("Packet") || isPacketRequestSuggestedOutcome(a.outcome) ? (
                          <button
                            type="button"
                            onClick={() => setPacketActivity({ id: a.id, outcome: a.outcome, notes: a.notes })}
                            className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100"
                          >
                            Create Packet Request
                          </button>
                        ) : null}
                        {!isReferralLeadSuggestedOutcome(a.outcome) &&
                        !a.flags.includes("Packet") &&
                        !isPacketRequestSuggestedOutcome(a.outcome) ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {previewId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 p-4">
          <button type="button" className="absolute inset-0" aria-label="Close preview" onClick={() => setPreviewId(null)} />
          <div className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={facilityPhotoFileUrl(previewId)} alt="Facility photo" className="max-h-[85vh] w-full object-contain" />
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-3 py-1 text-sm font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <FacilityReferralLeadModal
        open={Boolean(referralActivityId)}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaults={{
          activityId: referralActivityId,
          defaultRepId,
          originatingOutcome: activities.find((x) => x.id === referralActivityId)?.outcome ?? null,
        }}
        onClose={() => setReferralActivityId(null)}
      />

      <FacilityPacketRequestModal
        open={Boolean(packetActivity)}
        onClose={() => setPacketActivity(null)}
        facilityId={facilityId}
        facilityName={facilityName}
        activityId={packetActivity?.id}
        contacts={contacts}
        staffOptions={staffOptions}
        defaultAssignedTo={defaultRepId}
        defaultOutcome={packetActivity?.outcome}
        defaultNotes={packetActivity?.notes ?? undefined}
        source="manual"
      />
    </>
  );
}
