/** Row shape for `public.crm_tasks` (camelCase for app use). */

export type CrmTaskStatus = "open" | "in_progress" | "blocked" | "done" | "canceled";

export type CrmTaskPriority = "low" | "normal" | "high" | "urgent";

export type CrmTaskRelatedType =
  | "lead"
  | "recruit"
  | "employee"
  | "facility"
  | "patient"
  | "insurance_payer"
  | "general";

export type CrmTaskSource = "manual" | "ai_voice_transcription" | "ai_realtime";

export type CrmTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: CrmTaskStatus;
  priority: CrmTaskPriority;
  due_at: string | null;
  related_entity_type: CrmTaskRelatedType | null;
  related_entity_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  source: CrmTaskSource;
  ai_transcript: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmTaskListTab = "open" | "due_today" | "overdue" | "completed" | "all";

export type CrmTaskListFilters = {
  tab: CrmTaskListTab;
  search?: string;
  priority?: CrmTaskPriority | "" | null;
  related_entity_type?: CrmTaskRelatedType | null;
  related_entity_id?: string | null;
  /** Shorthand URL filter: restricts to CRM tasks pinned to one lead UUID. */
  pinned_lead_id?: string | null;
  /** Optional row cap (`listCrmTasks` clamps 1–500; lead sidebar defaults to ~10 elsewhere). */
  result_limit?: number;
};
