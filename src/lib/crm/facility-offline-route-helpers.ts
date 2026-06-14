import type { OfflineQueueItem } from "@/lib/crm/facility-offline-queue";
import type { RouteStopCard, RouteStopStatus } from "@/lib/crm/facility-route-types";

/** Merge server stop status with pending offline queue actions for UI display. */
export function effectiveStopStatus(
  stop: RouteStopCard,
  pendingItems: OfflineQueueItem[]
): { status: RouteStopStatus | "pending_sync"; pendingCheckIn: boolean; pendingComplete: boolean; pendingSkip: boolean } {
  const forStop = pendingItems.filter((i) => i.related_stop_id === stop.id);
  const pendingCheckIn = forStop.some((i) => i.type === "route_check_in" && (i.status === "pending" || i.status === "failed" || i.status === "syncing"));
  const pendingComplete = forStop.some((i) => i.type === "route_stop_complete" && (i.status === "pending" || i.status === "failed" || i.status === "syncing"));
  const pendingSkip = forStop.some((i) => i.type === "route_stop_skip" && (i.status === "pending" || i.status === "failed" || i.status === "syncing"));

  if (pendingComplete) return { status: "pending_sync", pendingCheckIn, pendingComplete, pendingSkip };
  if (pendingSkip) return { status: "pending_sync", pendingCheckIn, pendingComplete, pendingSkip };
  if (pendingCheckIn && stop.status === "pending") {
    return { status: "checked_in", pendingCheckIn: true, pendingComplete, pendingSkip };
  }
  return { status: stop.status, pendingCheckIn, pendingComplete, pendingSkip };
}

export function formatOfflineTypeLabel(type: OfflineQueueItem["type"]): string {
  switch (type) {
    case "quick_log":
      return "Quick Log";
    case "photo_note":
      return "Photo Note";
    case "ai_capture_note":
      return "AI Capture draft";
    case "route_check_in":
      return "Check-in";
    case "route_stop_complete":
      return "Complete stop";
    case "route_stop_skip":
      return "Skip stop";
    case "follow_up_complete":
      return "Follow-up";
    case "packet_mark_sent_manual":
      return "Packet sent";
    default:
      return type;
  }
}
