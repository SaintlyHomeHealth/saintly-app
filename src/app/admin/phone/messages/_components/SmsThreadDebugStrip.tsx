import { SmsThreadDebugControls } from "./SmsThreadDebugControls";

type Props = {
  conversationId: string;
  unreadInboundCount: number;
  lastMessageDirection: string | null;
  hasUnviewedInbound: boolean;
};

/** Temporary: remove when SMS unread debugging is done. */
export function SmsThreadDebugStrip({
  conversationId,
  unreadInboundCount,
  lastMessageDirection,
  hasUnviewedInbound,
}: Props) {
  return (
    <div className="rounded-lg border border-amber-300/90 bg-amber-50/95 px-3 py-2 text-amber-950 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90">SMS debug (temporary)</p>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px] leading-snug">
        <li>Unread inbound count (direction=inbound, viewed_at IS NULL): {unreadInboundCount}</li>
        <li>Last message direction: {lastMessageDirection ?? "—"}</li>
        <li>Unviewed inbound present: {hasUnviewedInbound ? "yes" : "no"}</li>
      </ul>
      <SmsThreadDebugControls conversationId={conversationId} />
    </div>
  );
}
