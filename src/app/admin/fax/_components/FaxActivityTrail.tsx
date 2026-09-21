import { formatFaxDateTimeDetail } from "@/lib/fax/format-fax-time";
import { fx } from "@/app/admin/fax/_components/fax-tokens";

export type FaxActivityItem = {
  id: string;
  event_type: string;
  created_at: string;
  payload?: Record<string, unknown> | null;
};

const LABELS: Record<string, string> = {
  received: "Received",
  "fax.received": "Received",
  extraction_completed: "Extracted",
  viewed: "Reviewed",
  triage_updated: "Status changed",
  structured_fields_updated: "Fields updated",
  patient_linked: "Linked to patient",
  archived: "Filed / archived",
  assigned: "Assigned",
  note_updated: "Note updated",
  ai_note_generated: "Note generated",
};

function labelFor(eventType: string, payload?: Record<string, unknown> | null): string {
  if (eventType === "triage_updated" && payload?.triage_state) {
    return `Marked ${String(payload.triage_state)}`;
  }
  return LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

export function FaxActivityTrail({ items }: { items: FaxActivityItem[] }) {
  if (items.length === 0) {
    return <p className={fx.muted}>No activity yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-[13px]">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--fx-accent)]" />
          <div>
            <p className="font-medium">{labelFor(item.event_type, item.payload)}</p>
            <p className={`${fx.muted} tabular-nums`}>{formatFaxDateTimeDetail(item.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
