import { SmsThreadDebugControls } from "./SmsThreadDebugControls";

type Props = {
  conversationId: string;
  unreadInboundCount: number;
  lastMessageDirection: string | null;
  hasUnviewedInbound: boolean;
  /** When SMS_THREAD_DEBUG: last N hydrated messages (Sid + attachment counts from server snapshot). */
  recentMmsHydration?: Array<{
    messageId: string;
    externalMessageSid: string | null;
    bodyLen: number;
    attachmentCount: number;
  }>;
};

/** Temporary: remove when SMS unread debugging is done. */
export function SmsThreadDebugStrip({
  conversationId,
  unreadInboundCount,
  lastMessageDirection,
  hasUnviewedInbound,
  recentMmsHydration,
}: Props) {
  return (
    <div className="rounded-lg border border-amber-300/90 bg-amber-50/95 px-3 py-2 text-amber-950 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90">SMS debug (temporary)</p>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px] leading-snug">
        <li>Unread inbound count (direction=inbound, viewed_at IS NULL): {unreadInboundCount}</li>
        <li>Last message direction: {lastMessageDirection ?? "—"}</li>
        <li>Unviewed inbound present: {hasUnviewedInbound ? "yes" : "no"}</li>
      </ul>
      {recentMmsHydration?.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-amber-900/90 hover:underline">
            MMS hydration snapshot (recent messages)
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-amber-200/80 bg-white/80 px-2 py-1.5">
            <ul className="space-y-1 font-mono text-[10px] leading-snug text-amber-950">
              {recentMmsHydration.map((r) => (
                <li key={r.messageId}>
                  id=<span className="select-all">{r.messageId}</span>
                  {" · "}
                  sid=
                  <span className={r.externalMessageSid ? "select-all" : "text-red-700"}>
                    {r.externalMessageSid ?? "—"}
                  </span>
                  {" · "}bodyLen={r.bodyLen}
                  {" · "}attachments={r.attachmentCount}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-1 text-[10px] text-amber-900/80">
            Signed media: open thread devtools Network on <span className="font-mono">/api/workspace/phone/message-media/</span>
            requests (302 to storage). Rows live in Supabase <span className="font-mono">phone_message_attachments</span>; bucket{" "}
            <span className="font-mono">phone-message-media</span>.
          </p>
        </details>
      ) : null}
      <SmsThreadDebugControls conversationId={conversationId} />
    </div>
  );
}
