/** Stored in `lead_activities.event_type`. */
export const LEAD_ACTIVITY_EVENT = {
  manual_note: "manual_note",
  contact_attempt: "contact_attempt",
  status_changed: "status_changed",
  owner_changed: "owner_changed",
  follow_up_changed: "follow_up_changed",
  next_action_changed: "next_action_changed",
  payer_updated: "payer_updated",
  referral_updated: "referral_updated",
  request_details_updated: "request_details_updated",
  lead_notes_updated: "lead_notes_updated",
  medicare_updated: "medicare_updated",
  document_uploaded: "document_uploaded",
  intake_field_updated: "intake_field_updated",
  dob_updated: "dob_updated",
  converted: "converted",
  marked_dead: "marked_dead",
  lead_temperature_updated: "lead_temperature_updated",
} as const;

export type LeadActivityEventType = (typeof LEAD_ACTIVITY_EVENT)[keyof typeof LEAD_ACTIVITY_EVENT];

export function leadActivityEventLabel(eventType: string): string {
  const t = eventType.trim().toLowerCase();
  switch (t) {
    case LEAD_ACTIVITY_EVENT.manual_note:
      return "Note";
    case LEAD_ACTIVITY_EVENT.contact_attempt:
      return "Contact attempt";
    case LEAD_ACTIVITY_EVENT.status_changed:
      return "Status";
    case LEAD_ACTIVITY_EVENT.owner_changed:
      return "Owner";
    case LEAD_ACTIVITY_EVENT.follow_up_changed:
      return "Follow-up";
    case LEAD_ACTIVITY_EVENT.next_action_changed:
      return "Next action";
    case LEAD_ACTIVITY_EVENT.payer_updated:
      return "Payer";
    case LEAD_ACTIVITY_EVENT.referral_updated:
      return "Referral";
    case LEAD_ACTIVITY_EVENT.request_details_updated:
      return "Request details";
    case LEAD_ACTIVITY_EVENT.lead_notes_updated:
      return "Lead notes";
    case LEAD_ACTIVITY_EVENT.medicare_updated:
      return "Medicare";
    case LEAD_ACTIVITY_EVENT.document_uploaded:
      return "Document";
    case LEAD_ACTIVITY_EVENT.intake_field_updated:
      return "Intake";
    case LEAD_ACTIVITY_EVENT.dob_updated:
      return "Date of birth";
    case LEAD_ACTIVITY_EVENT.converted:
      return "Converted";
    case LEAD_ACTIVITY_EVENT.marked_dead:
      return "Closed";
    case LEAD_ACTIVITY_EVENT.lead_temperature_updated:
      return "Priority";
    default:
      return eventType.replace(/_/g, " ");
  }
}

/** Bubble + rail colors for thread rows (subtle, distinct). */
export function leadActivityThreadClasses(eventType: string): { rail: string; bubble: string; label: string } {
  const t = eventType.trim().toLowerCase();
  if (t === LEAD_ACTIVITY_EVENT.manual_note) {
    return {
      rail: "bg-slate-300/90",
      bubble: "border-slate-200/90 bg-white text-slate-900",
      label: "text-slate-600",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.contact_attempt) {
    return {
      rail: "bg-sky-400/90",
      bubble: "border-sky-200/90 bg-sky-50/80 text-slate-900",
      label: "text-sky-800",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.status_changed || t === LEAD_ACTIVITY_EVENT.marked_dead || t === LEAD_ACTIVITY_EVENT.converted) {
    return {
      rail: "bg-amber-400/85",
      bubble: "border-amber-200/90 bg-amber-50/70 text-slate-900",
      label: "text-amber-900",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.owner_changed) {
    return {
      rail: "bg-violet-400/85",
      bubble: "border-violet-200/90 bg-violet-50/70 text-slate-900",
      label: "text-violet-900",
    };
  }
  if (
    t === LEAD_ACTIVITY_EVENT.follow_up_changed ||
    t === LEAD_ACTIVITY_EVENT.next_action_changed ||
    t === LEAD_ACTIVITY_EVENT.lead_temperature_updated
  ) {
    return {
      rail: "bg-cyan-400/80",
      bubble: "border-cyan-200/85 bg-cyan-50/65 text-slate-900",
      label: "text-cyan-900",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.payer_updated || t === LEAD_ACTIVITY_EVENT.medicare_updated) {
    return {
      rail: "bg-teal-400/85",
      bubble: "border-teal-200/90 bg-teal-50/65 text-slate-900",
      label: "text-teal-900",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.referral_updated) {
    return {
      rail: "bg-indigo-400/85",
      bubble: "border-indigo-200/90 bg-indigo-50/65 text-slate-900",
      label: "text-indigo-900",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.request_details_updated || t === LEAD_ACTIVITY_EVENT.lead_notes_updated) {
    return {
      rail: "bg-slate-400/70",
      bubble: "border-slate-200/90 bg-slate-50/90 text-slate-900",
      label: "text-slate-700",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.document_uploaded) {
    return {
      rail: "bg-emerald-400/85",
      bubble: "border-emerald-200/90 bg-emerald-50/65 text-slate-900",
      label: "text-emerald-900",
    };
  }
  if (t === LEAD_ACTIVITY_EVENT.dob_updated || t === LEAD_ACTIVITY_EVENT.intake_field_updated) {
    return {
      rail: "bg-orange-300/90",
      bubble: "border-orange-200/85 bg-orange-50/50 text-slate-900",
      label: "text-orange-900",
    };
  }
  return {
    rail: "bg-slate-300/80",
    bubble: "border-slate-200/90 bg-white text-slate-900",
    label: "text-slate-600",
  };
}
