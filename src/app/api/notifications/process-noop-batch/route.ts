import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  NOOP_BATCH_MAX_LIMIT,
  processNoopNotificationBatch,
} from "@/lib/notifications/process-noop-batch";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

/**
 * Admin/super_admin only: moves up to NOOP_BATCH_MAX_LIMIT pending rows through
 * pending → processing → sent, with a notification_delivery_attempt (channel noop).
 * No email/SMS.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffProfile = await getStaffProfile();
  if (!isAdminOrHigher(staffProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let bodyLimit: number | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.limit === "number") {
      bodyLimit = body.limit;
    }
  } catch {
    bodyLimit = undefined;
  }

  try {
    const { results } = await processNoopNotificationBatch(supabaseAdmin, {
      limit: bodyLimit,
    });

    const sent = results.filter((r) => r.outcome === "sent").length;
    const skipped = results.filter((r) => r.outcome === "skipped").length;
    const errors = results.filter((r) => r.outcome === "error").length;

    return NextResponse.json({
      ok: true,
      results,
      summary: { sent, skipped, errors, maxBatch: NOOP_BATCH_MAX_LIMIT },
    });
  } catch (e) {
    console.error("[process-noop-batch]", e);
    return NextResponse.json({ error: "Process batch failed" }, { status: 500 });
  }
}
