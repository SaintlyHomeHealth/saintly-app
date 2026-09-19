/**
 * Re-process inbound faxes into structured extraction columns.
 * Never overwrites fax_messages.note.
 *
 *   DRY_RUN=1 NODE_OPTIONS='--conditions=react-server' npx tsx scripts/backfill-fax-extraction.ts
 *   LIMIT=20 NODE_OPTIONS='--conditions=react-server' npx tsx scripts/backfill-fax-extraction.ts
 */

async function main() {
  const dryRun = process.env.DRY_RUN !== "0";
  const limit = Number.parseInt(process.env.LIMIT ?? "135", 10);

  const { supabaseAdmin } = await import("../src/lib/admin");
  const { extractInboundFaxStructured } = await import("../src/lib/fax/inbound-fax-extract");

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .select("id, page_count, storage_path, extraction_status, patient_name")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(Number.isFinite(limit) ? limit : 135);

  if (error) {
    console.error("backfill query failed:", error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  console.log(
    JSON.stringify({
      dry_run: dryRun,
      count: rows.length,
      ids: rows.map((r) => r.id),
    })
  );

  if (dryRun) {
    console.log("Dry run only. Set DRY_RUN=0 to write structured columns.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await extractInboundFaxStructured(row.id as string);
    if (result.ok) ok += 1;
    else failed += 1;
    console.log("[backfill]", {
      fax_id: row.id,
      ok: result.ok,
      status: result.ok ? result.status : "skipped" in result && result.skipped ? result.reason : "error",
    });
  }
  console.log(JSON.stringify({ ok, failed }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
