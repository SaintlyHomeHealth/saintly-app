/**
 * One-time backfill: link existing recruiting_candidates to facebook_recruiting_leads.
 * Run: npm run backfill:recruiting-lead-links
 *
 * Safe to re-run — uses the same dedupe rules as live uploads (email, phone, name+city).
 */

import { supabaseAdmin } from "../src/lib/admin";
import { syncRecruitingLeadForCandidate } from "../src/lib/recruiting/recruiting-lead-candidate-bridge";

const BATCH = 100;

async function main() {
  let offset = 0;
  let linked = 0;
  let failed = 0;
  let skipped = 0;

  for (;;) {
    const { data: rows, error } = await supabaseAdmin
      .from("recruiting_candidates")
      .select("id, recruiting_lead_id")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("fetch failed:", error.message);
      process.exit(1);
    }

    if (!rows?.length) break;

    for (const row of rows) {
      const id = String(row.id);
      if (row.recruiting_lead_id) {
        const res = await syncRecruitingLeadForCandidate(supabaseAdmin, id);
        if (res.ok) linked++;
        else failed++;
        continue;
      }

      const res = await syncRecruitingLeadForCandidate(supabaseAdmin, id);
      if (res.ok) linked++;
      else {
        failed++;
        console.warn("failed", id, res.error);
      }
    }

    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  console.log("backfill:recruiting-lead-links complete", { linked, failed, skipped, scanned: offset });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
