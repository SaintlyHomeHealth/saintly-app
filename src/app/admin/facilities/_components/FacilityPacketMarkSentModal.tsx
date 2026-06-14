"use client";

import { useState } from "react";

import {
  PacketReferralLinkActions,
  type PacketReferralLinkInfo,
} from "@/app/admin/facilities/_components/PacketReferralLinkPanel";
import type { PacketDeliveryMethod, PacketRequestCard } from "@/lib/crm/facility-packet-types";
import { PACKET_DELIVERY_LABELS } from "@/lib/crm/facility-packet-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityPacketMarkSentModalProps = {
  request: PacketRequestCard;
  onDone?: () => void;
  className?: string;
};

export function FacilityPacketMarkSentModal({ request, onDone, className }: FacilityPacketMarkSentModalProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PacketDeliveryMethod>(request.delivery_method ?? "fax");
  const [notes, setNotes] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [createReferralLink, setCreateReferralLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successLink, setSuccessLink] = useState<PacketReferralLinkInfo | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/packet-requests/${request.id}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sent_method: method,
          sent_notes: notes.trim() || null,
          create_follow_up: createFollowUp,
          create_referral_link: createReferralLink,
          material_ids: request.material_ids ?? [],
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        referral_link?: { id: string; public_url: string; token_segment: string } | null;
      };
      if (!data.ok) {
        setError("Could not mark sent.");
        return;
      }
      if (data.referral_link) {
        setSuccessLink({
          source_link_id: data.referral_link.id,
          public_url: data.referral_link.public_url,
          token_segment: data.referral_link.token_segment,
        });
      } else {
        setOpen(false);
        onDone?.();
      }
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  function closeAll() {
    setOpen(false);
    setSuccessLink(null);
    onDone?.();
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Mark Sent
      </button>
      {open ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            {successLink ? (
              <>
                <h3 className="text-lg font-bold text-slate-900">Packet marked sent</h3>
                <p className="mt-1 text-sm text-slate-600">{request.facility_name}</p>
                <p className="mt-3 text-sm text-slate-700">Share this trackable referral link with the office:</p>
                <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {successLink.public_url}
                </p>
                <div className="mt-3">
                  <PacketReferralLinkActions link={successLink} />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={closeAll}
                    className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-slate-900">Mark packet sent</h3>
                <p className="mt-1 text-sm text-slate-600">{request.facility_name}</p>
                <label className="mt-4 block text-xs font-semibold uppercase text-slate-500">
                  Sent method
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PacketDeliveryMethod)}
                    className={`${crmFilterInputCls} mt-1 w-full`}
                  >
                    {Object.entries(PACKET_DELIVERY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                  Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className={`${crmFilterInputCls} mt-1 w-full`}
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} />
                  Create follow-up to confirm receipt (due tomorrow)
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createReferralLink}
                    onChange={(e) => setCreateReferralLink(e.target.checked)}
                  />
                  Create trackable referral link for this packet
                </label>
                {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submit()}
                    className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Mark Sent"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
