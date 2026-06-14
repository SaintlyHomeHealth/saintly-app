"use client";

import Link from "next/link";

import { FacilityPacketConfirmReceivedModal } from "@/app/admin/facilities/_components/FacilityPacketConfirmReceivedModal";
import { FacilityPacketDeliveryHistoryModal, FacilityPacketSendModal } from "@/app/admin/facilities/_components/FacilityPacketSendModal";
import { FacilityPacketMarkSentModal } from "@/app/admin/facilities/_components/FacilityPacketMarkSentModal";
import { PacketReferralLinkActions } from "@/app/admin/facilities/_components/PacketReferralLinkPanel";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import {
  PACKET_DELIVERY_LABELS,
  PACKET_STATUS_LABELS,
  PACKET_TYPE_LABELS,
} from "@/lib/crm/facility-packet-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { appleMapsDirectionsUrl } from "@/lib/crm/apple-maps";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

type FacilityPacketRequestCardProps = {
  request: PacketRequestCard;
  onUpdated?: () => void;
  showCancel?: boolean;
  compact?: boolean;
};

export function FacilityPacketRequestCard({
  request,
  onUpdated,
  showCancel = false,
  compact = false,
}: FacilityPacketRequestCardProps) {
  const tel = request.recipient_phone || request.facility_phone;
  const telHref = tel ? `tel:${tel.replace(/[^\d+]/g, "")}` : null;
  const mapsUrl = appleMapsDirectionsUrl({
    address: request.facility_address,
    latitude: request.facility_latitude,
    longitude: request.facility_longitude,
  });

  const statusCls =
    request.status === "pending"
      ? request.is_overdue
        ? "bg-rose-100 text-rose-900"
        : request.is_due_today
          ? "bg-amber-100 text-amber-950"
          : "bg-sky-100 text-sky-900"
      : request.status === "sent"
        ? "bg-violet-100 text-violet-900"
        : request.status === "confirmed_received"
          ? "bg-emerald-100 text-emerald-900"
          : "bg-slate-100 text-slate-700";

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        request.is_overdue && request.status === "pending" ? "border-rose-300" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/admin/facilities/${request.facility_id}`} className="text-base font-semibold text-slate-900 hover:text-sky-800">
            {request.facility_name}
          </Link>
          <p className="text-sm text-slate-600">
            {[request.facility_type, request.facility_city].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {request.recipient_name ?? "No recipient"} ·{" "}
            {request.delivery_method ? PACKET_DELIVERY_LABELS[request.delivery_method] : "Method TBD"}
          </p>
          {!compact ? (
            <p className="mt-1 text-xs text-slate-500">
              {request.packet_type ? PACKET_TYPE_LABELS[request.packet_type] : "General packet"}
              {request.recipient_fax ? ` · Fax ${request.recipient_fax}` : ""}
              {request.recipient_email ? ` · ${request.recipient_email}` : ""}
            </p>
          ) : null}
          {(request.delivery_attempt_count ?? 0) > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {request.delivery_attempt_count} attempt{request.delivery_attempt_count === 1 ? "" : "s"}
              {request.last_delivery_status ? ` · Last: ${request.last_delivery_status}` : ""}
              {request.delivery_error ? (
                <span className="text-rose-700"> · {request.delivery_error}</span>
              ) : null}
            </p>
          ) : null}
          {request.sent_at ? (
            <p className="mt-1 text-xs text-slate-500">
              Sent {formatFacilityDate(request.sent_at)}
              {request.sent_by_label ? ` by ${request.sent_by_label}` : ""}
            </p>
          ) : null}
          {request.referral_link ? (
            <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50/50 px-2 py-1.5">
              <p className="text-[10px] font-bold uppercase text-teal-900">Packet referral link</p>
              <PacketReferralLinkActions link={request.referral_link} compact showStats />
            </div>
          ) : null}
          {request.notes ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{request.notes}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusCls}`}>
              {PACKET_STATUS_LABELS[request.status]}
            </span>
            {request.source ? (
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {request.source.replace("_", " ")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          {request.due_at ? <p>Due {formatFacilityDate(request.due_at)}</p> : null}
          {request.assigned_to_label ? <p>Rep: {request.assigned_to_label}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {request.status === "pending" || request.status === "failed" ? (
          <FacilityPacketSendModal request={request} onDone={onUpdated} className={crmActionBtnSky} />
        ) : null}
        {request.status === "pending" || request.status === "failed" ? (
          <FacilityPacketMarkSentModal request={request} onDone={onUpdated} className={crmActionBtnMuted} />
        ) : null}
        {(request.delivery_attempt_count ?? 0) > 0 ? (
          <FacilityPacketDeliveryHistoryModal packetRequestId={request.id} className={crmActionBtnMuted} />
        ) : null}
        {request.status === "sent" ? (
          <FacilityPacketConfirmReceivedModal request={request} onDone={onUpdated} className={crmActionBtnSky} />
        ) : null}
        <Link href={`/admin/facilities/${request.facility_id}`} className={crmActionBtnMuted}>
          Open Facility
        </Link>
        {telHref ? (
          <a href={telHref} className={crmActionBtnMuted}>
            Call
          </a>
        ) : null}
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className={crmActionBtnMuted}>
            Directions
          </a>
        ) : null}
        <FacilityQuickLogButton facilityId={request.facility_id} facilityName={request.facility_name} className={crmActionBtnMuted}>
          Quick Log
        </FacilityQuickLogButton>
        {showCancel && request.status === "pending" ? (
          <button
            type="button"
            className={`${crmActionBtnMuted} text-rose-800`}
            onClick={() => {
              void fetch(`/api/facilities/packet-requests/${request.id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              }).then(() => onUpdated?.());
            }}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </article>
  );
}
