export type GlobalSearchResultType =
  | "lead"
  | "patient"
  | "contact"
  | "call"
  | "private_pay"
  | "fax"
  | "packet"
  | "applicant"
  | "recruit"
  | "inbound_email"
  | "facility"
  | "crm_task"
  | "conversation";

export type GlobalSearchResult = {
  type: GlobalSearchResultType;
  id: string;
  title: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  sourceTrail: string[];
  matchedFields: string[];
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
  href: string;
  /** Internal ranking score — stripped before API response. */
  rankScore?: number;
  callDirection?: string | null;
  callPartyNumber?: string | null;
  relatedEntityLabel?: string | null;
  /** Number of CRM records (lead/patient/contact) sharing this normalized phone. */
  sharedPhoneRecordCount?: number;
  /** True when multiple CRM records share the same phone number. */
  sharedPhoneWarning?: boolean;
};

export type ParsedGlobalSearchQuery = {
  raw: string;
  trimmed: string;
  lower: string;
  digits: string;
  isPhone: boolean;
  isEmail: boolean;
  ilikePattern: string;
};

export type GlobalSearchResponse = {
  query: string;
  results: GlobalSearchResult[];
  groups: {
    bestMatches: GlobalSearchResult[];
    leads: GlobalSearchResult[];
    patients: GlobalSearchResult[];
    calls: GlobalSearchResult[];
    privatePay: GlobalSearchResult[];
    other: GlobalSearchResult[];
  };
};
