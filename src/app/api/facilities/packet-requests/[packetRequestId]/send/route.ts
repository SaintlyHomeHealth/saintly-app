import { NextResponse } from "next/server";

import { sendPacketRequest } from "@/lib/crm/facility-packet-delivery";
import type { PacketSendDeliveryMethod } from "@/lib/crm/facility-packet-types";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ packetRequestId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { packetRequestId } = await context.params;
  let body: {
    delivery_method?: PacketSendDeliveryMethod;
    recipient_email?: string | null;
    recipient_fax?: string | null;
    recipient_name?: string | null;
    subject?: string | null;
    message?: string | null;
    cover_sheet?: string | null;
    material_ids?: string[];
    create_follow_up?: boolean;
    follow_up_due_at?: string | null;
    sent_notes?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.delivery_method || !["email", "fax", "manual"].includes(body.delivery_method)) {
    return NextResponse.json({ ok: false, code: "INVALID_METHOD", message: "Invalid delivery method." }, { status: 400 });
  }

  const result = await sendPacketRequest(staff, packetRequestId, {
    delivery_method: body.delivery_method,
    recipient_email: body.recipient_email,
    recipient_fax: body.recipient_fax,
    recipient_name: body.recipient_name,
    subject: body.subject,
    message: body.message,
    cover_sheet: body.cover_sheet,
    material_ids: body.material_ids,
    create_follow_up: body.create_follow_up,
    follow_up_due_at: body.follow_up_due_at,
    sent_notes: body.sent_notes,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
          ? 403
          : result.code === "EMAIL_NOT_CONFIGURED" || result.code === "FAX_NOT_CONFIGURED"
            ? 503
            : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({
    ok: true,
    packet_request: result.packet_request,
    delivery_attempt: result.delivery_attempt,
    activity: result.activity_id ? { id: result.activity_id } : null,
    follow_up_task: result.follow_up_task_id ? { id: result.follow_up_task_id } : null,
  });
}
