export type FacilityAnalyticsFilters = {
  startDate: string;
  endDate: string;
  repId?: string | null;
  city?: string | null;
  facilityType?: string | null;
  source?: string | null;
};

export type AnalyticsSummaryCard = {
  key: string;
  label: string;
  value: number;
  priorValue: number;
  changePct: number | null;
};

export type AgentPerformanceRow = {
  repUserId: string;
  repLabel: string;
  totalActivities: number;
  inPersonVisits: number;
  phoneCalls: number;
  aiCaptures: number;
  photoNotes: number;
  facilitiesVisited: number;
  newFacilitiesAdded: number;
  followUpsCompleted: number;
  overdueFollowUps: number;
  materialsDropped: number;
  decisionMakersMet: number;
  referralsReceived: number;
  routesCompleted: number;
  routeStopsCompleted: number;
  routeCompletionRate: number | null;
  lastActivityAt: string | null;
};

export type ActivityTrendPoint = {
  date: string;
  activities: number;
  inPersonVisits: number;
  followUpsCompleted: number;
  materialsDropped: number;
};

export type WarmSourceRow = {
  facilityId: string;
  facilityName: string;
  facilityType: string | null;
  city: string | null;
  lastActivityAt: string | null;
  lastOutcome: string | null;
  referralPotential: string | null;
  followUpTaskDue: string | null;
  followUpTaskTitle: string | null;
  assignedRepLabel: string | null;
  warmthScore: number;
  warmthReasons: string[];
};

export type AtRiskFacilityRow = {
  facilityId: string;
  facilityName: string;
  facilityType: string | null;
  city: string | null;
  reason: string;
  lastActivityAt: string | null;
  nextFollowUpAt: string | null;
  assignedRepLabel: string | null;
};

export type PhotoProofRow = {
  photoId: string;
  facilityId: string;
  facilityName: string;
  photoType: string | null;
  aiSummary: string | null;
  uploadedByLabel: string | null;
  uploadedAt: string;
  activityId: string | null;
};

export type FollowUpDisciplineBySource = {
  source: string;
  created: number;
  completed: number;
  snoozed: number;
  canceled: number;
  overdue: number;
};

export type FollowUpDisciplineData = {
  created: number;
  completed: number;
  snoozed: number;
  canceled: number;
  overdue: number;
  completionRate: number | null;
  avgDaysOverdue: number | null;
  completedThisWeek: number;
  byRep: Array<{ repLabel: string; created: number; completed: number; overdue: number }>;
  bySource: FollowUpDisciplineBySource[];
  recentTasks: Array<{
    id: string;
    title: string;
    facilityId: string;
    facilityName: string;
    dueAt: string;
    status: string;
    assignedRepLabel: string | null;
    source: string | null;
  }>;
};

export type FacilityGrowthData = {
  totalFacilities: number;
  importedFromGoogle: number;
  manuallyAdded: number;
  noActivity: number;
  withCoordinates: number;
  withContacts: number;
  withPhotos: number;
  withFollowUpTasks: number;
  newInRange: Array<{
    facilityId: string;
    facilityName: string;
    source: string;
    addedByLabel: string | null;
    addedAt: string;
    firstActivityStatus: string;
  }>;
};

export type BreakdownRow = {
  label: string;
  facilities: number;
  visited: number;
  warm: number;
  packetRequests: number;
  overdueFollowUps: number;
};

export type ReferralAttributionData = {
  leadsCreated: number;
  converted: number;
  conversionRate: number | null;
  topProducingSources: Array<{
    facilityId: string;
    facilityName: string;
    facilityType: string | null;
    city: string | null;
    leads: number;
    converted: number;
    conversionRate: number | null;
    lastReferralAt: string | null;
    assignedRepLabel: string | null;
  }>;
  byRep: Array<{ repUserId: string; repLabel: string; leads: number; converted: number }>;
  byContact: Array<{ contactName: string; leads: number; converted: number }>;
  byService: Array<{ label: string; count: number }>;
  byPayer: Array<{ label: string; count: number }>;
  printedQr?: {
    total: number;
    matched: number;
    unmatched: number;
  };
  sourceLinks?: {
    linksCreated: number;
    tokenLeads: number;
    tokenViews: number;
    topLinks: Array<{ linkId: string; label: string; leads: number; views: number }>;
  };
};

export type ReferralPipelineAnalyticsData = {
  leadsCreated: number;
  contactedCount: number;
  insuranceVerifiedCount: number;
  waitingOrdersCount: number;
  readyForSocCount: number;
  convertedCount: number;
  lostCount: number;
  conversionRate: number | null;
  avgDaysToConversion: number | null;
  referralsWaitingOnOrders: number;
  topFacilitiesConverted: Array<{ facilityId: string; facilityName: string; count: number }>;
  topFacilitiesLost: Array<{ facilityId: string; facilityName: string; count: number }>;
  topRepsConverted: Array<{ repUserId: string; repLabel: string; count: number }>;
  pipelineHealth: Array<{
    stage_key: string;
    stage_label: string;
    count: number;
    average_age_days: number | null;
    oldest_referral_at: string | null;
    action_needed: string | null;
  }>;
  referralsWithDocuments: number;
  documentsNeedingReview: number;
  averageDocumentsPerReferral: number | null;
  referralsMissingDocuments: number;
  documentsByType: Record<string, number>;
  documentsAiReviewed: number;
  documentsAiReviewNeeded: number;
  referralsMissingPhysicianOrder: number;
  referralsMissingInsurance: number;
  averageAiConfidence: number | null;
  intakeReadiness?: import("@/lib/crm/lead-intake-readiness-types").IntakeReadinessAnalytics;
};

export type FacilityAnalyticsData = {
  filters: FacilityAnalyticsFilters;
  summary: AnalyticsSummaryCard[];
  agentPerformance: AgentPerformanceRow[];
  activityTrend: ActivityTrendPoint[];
  warmSources: WarmSourceRow[];
  atRiskFacilities: AtRiskFacilityRow[];
  photoProof: {
    photosUploaded: number;
    businessCards: number;
    swagBags: number;
    postcards: number;
    packetFaxRequests: number;
    facilitiesWithPhotos: number;
    recent: PhotoProofRow[];
  };
  followUpDiscipline: FollowUpDisciplineData;
  facilityGrowth: FacilityGrowthData;
  breakdowns: {
    byType: BreakdownRow[];
    byCity: BreakdownRow[];
  };
  referralAttribution: ReferralAttributionData;
  sourceReview: import("@/lib/crm/facility-referral-source-review-types").ReferralSourceReviewSummary;
  referralPipeline: ReferralPipelineAnalyticsData;
  intakeReadiness?: import("@/lib/crm/lead-intake-readiness-types").IntakeReadinessAnalytics;
  admissionHandoff?: import("@/lib/crm/lead-admission-handoff-types").AdmissionHandoffAnalytics;
  packetFulfillment: import("@/lib/crm/facility-packet-types").PacketFulfillmentSummary;
  routePerformance: import("@/lib/crm/facility-route-types").RoutePerformanceSummary;
  filterOptions: {
    cities: string[];
    types: string[];
    reps: Array<{ userId: string; label: string }>;
  };
  referralProfileIntelligence?: {
    summary: {
      with_referral_process: number;
      with_best_contact: number;
      with_preferred_method: number;
      warm_hot_count: number;
      active_producer_count: number;
      missing_profile_count: number;
    };
    rows: import("@/lib/crm/facility-referral-profile-types").FacilityReferralProfileIntelligenceRow[];
  };
};

export type FacilityOutreachInsight = {
  totalActivities: number;
  lastVisitAt: string | null;
  openFollowUpTasks: number;
  photosUploaded: number;
  contactsCount: number;
  referralPotential: string | null;
  lastOutcome: string | null;
};
