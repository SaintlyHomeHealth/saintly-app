import type { SupabaseClient } from "@supabase/supabase-js";

import { parseGlobalSearchQuery } from "./query";
import {
  dedupeGlobalSearchResults,
  rankGlobalSearchResults,
  suppressRedundantContacts,
} from "./rank";
import {
  searchApplicants,
  searchConversations,
  searchCrmTasks,
  searchFacilities,
  searchFaxMessages,
  searchInboundEmails,
  searchLeadsAndPatients,
  searchPhoneCalls,
  searchPrivatePay,
  searchRecruitingCandidates,
  searchSignatureRecipients,
} from "./searchers";
import type { GlobalSearchResponse, GlobalSearchResult } from "./types";

const DEFAULT_LIMIT = 50;

export type GlobalSearchMode = "preview" | "full";

function groupResults(results: GlobalSearchResult[]): GlobalSearchResponse["groups"] {
  const bestMatches = results.slice(0, 8);
  const leads = results.filter((r) => r.type === "lead");
  const patients = results.filter((r) => r.type === "patient");
  const calls = results.filter((r) => r.type === "call" || r.type === "conversation");
  const privatePay = results.filter((r) => r.type === "private_pay");
  const other = results.filter(
    (r) =>
      !bestMatches.includes(r) &&
      r.type !== "lead" &&
      r.type !== "patient" &&
      r.type !== "call" &&
      r.type !== "conversation" &&
      r.type !== "private_pay"
  );

  return { bestMatches, leads, patients, calls, privatePay, other };
}

function stripInternalFields(results: GlobalSearchResult[]): GlobalSearchResult[] {
  return results.map(({ rankScore: _rankScore, ...rest }) => rest);
}

export async function runGlobalSearch(
  supabase: SupabaseClient,
  rawQuery: string,
  limit = DEFAULT_LIMIT,
  mode: GlobalSearchMode = "full"
): Promise<GlobalSearchResponse | null> {
  const query = parseGlobalSearchQuery(rawQuery);
  if (!query) {
    return {
      query: rawQuery.trim(),
      results: [],
      groups: { bestMatches: [], leads: [], patients: [], calls: [], privatePay: [], other: [] },
    };
  }

  const { results: crmResults, leadTrailsByContactId } = await searchLeadsAndPatients(supabase, query);

  let calls: GlobalSearchResult[] = [];
  let privatePay: GlobalSearchResult[] = [];
  let fax: GlobalSearchResult[] = [];
  let applicants: GlobalSearchResult[] = [];
  let packets: GlobalSearchResult[] = [];
  let recruits: GlobalSearchResult[] = [];
  let conversations: GlobalSearchResult[] = [];
  let facilities: GlobalSearchResult[] = [];
  let tasks: GlobalSearchResult[] = [];
  let inbound: GlobalSearchResult[] = [];

  if (mode === "preview") {
    [calls, conversations, facilities] = await Promise.all([
      searchPhoneCalls(supabase, query, leadTrailsByContactId),
      searchConversations(supabase, query),
      searchFacilities(supabase, query),
    ]);
  } else {
    [calls, privatePay, fax, applicants, packets, recruits, conversations, facilities, tasks, inbound] =
      await Promise.all([
        searchPhoneCalls(supabase, query, leadTrailsByContactId),
        searchPrivatePay(supabase, query),
        searchFaxMessages(supabase, query),
        searchApplicants(supabase, query),
        searchSignatureRecipients(supabase, query),
        searchRecruitingCandidates(supabase, query),
        searchConversations(supabase, query),
        searchFacilities(supabase, query),
        searchCrmTasks(supabase, query),
        searchInboundEmails(supabase, query),
      ]);
  }

  const merged = [
    ...crmResults,
    ...calls,
    ...privatePay,
    ...fax,
    ...applicants,
    ...packets,
    ...recruits,
    ...conversations,
    ...facilities,
    ...tasks,
    ...inbound,
  ];

  const deduped = suppressRedundantContacts(dedupeGlobalSearchResults(merged));
  const ranked = rankGlobalSearchResults(deduped, query).slice(0, limit);
  const results = stripInternalFields(ranked);

  return {
    query: query.trimmed,
    results,
    groups: groupResults(results),
  };
}
