/** Shared CRM voice UI / JSON shapes — safe to import from client components. */

import type { CrmTaskPriority, CrmTaskRelatedType } from "@/lib/crm/crm-task-types";

export type VoiceExtractedTask = {
  title: string;
  description: string | null;
  due_at: string | null;
  priority: CrmTaskPriority;
  related_entity_type: CrmTaskRelatedType | null;
  related_entity_id: string | null;
  confidence: number;
};

export type VoiceTaskExtractionResult = {
  tasks: VoiceExtractedTask[];
  warnings: string[];
};

export type VoiceTaskExtractionContext = {
  related_entity_type: CrmTaskRelatedType | null;
  related_entity_id: string | null;
  phoenix_today_iso: string;
  phoenix_tomorrow_iso: string;
};
