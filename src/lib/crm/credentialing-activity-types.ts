/** payer_credentialing_activity.activity_type — free text in DB; these are app conventions. */
export const PAYER_CREDENTIALING_ACTIVITY_TYPES = {
  record_created: "record_created",
  record_updated: "record_updated",
  status_change: "status_change",
  follow_up: "follow_up",
  notes_updated: "notes_updated",
  document_update: "document_update",
  owner_change: "owner_change",
  manual_note: "manual_note",
} as const;

export type PayerCredentialingActivityType =
  (typeof PAYER_CREDENTIALING_ACTIVITY_TYPES)[keyof typeof PAYER_CREDENTIALING_ACTIVITY_TYPES];

const PRETTY: Record<string, string> = {
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.record_created]: "Record created",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.record_updated]: "Details updated",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change]: "Status change",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.follow_up]: "Follow-up",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.notes_updated]: "Notes",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.document_update]: "Document",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.owner_change]: "Owner",
  [PAYER_CREDENTIALING_ACTIVITY_TYPES.manual_note]: "Note",
};

export function formatCredentialingActivityTypeLabel(activityType: string): string {
  return PRETTY[activityType] ?? activityType.replace(/_/g, " ");
}
