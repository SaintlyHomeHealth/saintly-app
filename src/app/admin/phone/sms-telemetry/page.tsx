import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatVoiceAiCallerCategoryLabel,
  formatVoiceAiRouteTargetLabel,
  formatUrgencyLabel,
} from "@/app/admin/phone/_lib/voice-ai-metadata";
import { supabaseAdmin } from "@/lib/admin";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { parseSmsSuggestionTelemetry, type SmsSuggestionTelemetry } from "@/lib/phone/sms-suggestion-telemetry";
import { getStaffProfile, isAdminOrHigher, isPhoneWorkspaceUser } from "@/lib/staff-profile";

const KNOWN_VOICE_CALLER_CATEGORIES = new Set([
  "patient_family",
  "caregiver_applicant",
  "referral_provider",
  "vendor_other",
  "spam",
]);

const ROLLUP_CATEGORY_ORDER = [
  "patient_family",
  "caregiver_applicant",
  "referral_provider",
  "vendor_other",
  "spam",
  "unknown",
] as const;

const ROLLUP_ROUTE_ORDER = [
  "intake_queue",
  "hiring_queue",
  "referral_team",
  "procurement",
  "security",
  "noop",
  "unknown",
] as const;

const ROLLUP_URGENCY_ORDER = ["critical", "high", "medium", "low", "unknown"] as const;

const ROLLUP_CALLBACK_ORDER = ["yes", "no", "unknown"] as const;

function asMeta(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/** Map saved CRM type (phone_calls / conversation metadata) to voice-style caller category keys. */
function crmTypeToCallerCategoryKey(crm: unknown): string | null {
  const c = asMeta(crm);
  if (!c) return null;
  const t = typeof c.type === "string" ? c.type.trim().toLowerCase() : "";
  if (t === "patient") return "patient_family";
  if (t === "caregiver") return "caregiver_applicant";
  if (t === "referral") return "referral_provider";
  if (t === "spam") return "spam";
  return null;
}

/** Best-effort category from `metadata.voice_ai` then `metadata.crm` (same shape as phone_calls). */
function callerCategoryKeyFromMetadata(metadata: unknown): string | null {
  const m = asMeta(metadata);
  if (!m) return null;
  const v = m.voice_ai;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const voiceAi = v as Record<string, unknown>;
    const callerCategory = voiceAi.caller_category;
    const cat =
      typeof callerCategory === "string" ? callerCategory.trim().toLowerCase() : "";
    if (cat && KNOWN_VOICE_CALLER_CATEGORIES.has(cat)) return cat;
  }
  return crmTypeToCallerCategoryKey(m.crm);
}

function resolveRowCallerCategoryKey(input: {
  convMeta: Record<string, unknown> | null;
  latestCallMeta: unknown;
}): string {
  const fromCall = callerCategoryKeyFromMetadata(input.latestCallMeta);
  if (fromCall) return fromCall;
  const fromConv = callerCategoryKeyFromMetadata(input.convMeta);
  if (fromConv) return fromConv;
  return "unknown";
}

function voiceAiBlockFromMetadata(metadata: unknown): Record<string, unknown> | null {
  const m = asMeta(metadata);
  if (!m) return null;
  const v = m.voice_ai;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function pickVoiceAiCallThenConv<T>(
  latestCallMeta: unknown,
  convMeta: Record<string, unknown> | null,
  pick: (block: Record<string, unknown>) => T | null
): T | null {
  const b1 = voiceAiBlockFromMetadata(latestCallMeta);
  if (b1) {
    const x = pick(b1);
    if (x != null) return x;
  }
  const b2 = voiceAiBlockFromMetadata(convMeta);
  if (b2) {
    const x = pick(b2);
    if (x != null) return x;
  }
  return null;
}

function resolveRouteTargetKey(input: {
  convMeta: Record<string, unknown> | null;
  latestCallMeta: unknown;
}): string {
  const raw = pickVoiceAiCallThenConv(input.latestCallMeta, input.convMeta, (v) => {
    const rt = typeof v.route_target === "string" ? v.route_target.trim().toLowerCase() : "";
    return rt || null;
  });
  return raw ?? "unknown";
}

function resolveUrgencyKey(input: {
  convMeta: Record<string, unknown> | null;
  latestCallMeta: unknown;
}): string {
  const raw = pickVoiceAiCallThenConv(input.latestCallMeta, input.convMeta, (v) => {
    const u = typeof v.urgency === "string" ? v.urgency.trim().toLowerCase() : "";
    return u || null;
  });
  return raw ?? "unknown";
}

function resolveCallbackKey(input: {
  convMeta: Record<string, unknown> | null;
  latestCallMeta: unknown;
}): string {
  const raw = pickVoiceAiCallThenConv(input.latestCallMeta, input.convMeta, (v) => {
    if (typeof v.callback_needed === "boolean") return v.callback_needed ? "yes" : "no";
    return null;
  });
  return raw ?? "unknown";
}

type TelemetryRollupMetrics = {
  shown_count: number;
  sent_unchanged_count: number;
  sent_edited_count: number;
};

type CategoryRollup = TelemetryRollupMetrics & {
  categoryKey: string;
  conversations: number;
  generation_count: number;
  superseded_count: number;
};

type DimRollup = TelemetryRollupMetrics & {
  dimKey: string;
  conversations: number;
};

function adoptionRateFromRollup(r: TelemetryRollupMetrics): number | null {
  if (r.shown_count <= 0) return null;
  return (r.sent_unchanged_count / r.shown_count) * 100;
}

function trustRateFromRollup(r: TelemetryRollupMetrics): number | null {
  const denom = r.sent_unchanged_count + r.sent_edited_count;
  if (denom <= 0) return null;
  return (r.sent_unchanged_count / denom) * 100;
}

/** Share edited among sends that used an active suggestion (same as per-row edit %). */
function editRateFromRollup(r: TelemetryRollupMetrics): number | null {
  const denom = r.sent_unchanged_count + r.sent_edited_count;
  if (denom <= 0) return null;
  return (r.sent_edited_count / denom) * 100;
}

function pickExtremeByMetric<R extends TelemetryRollupMetrics>(
  rows: R[],
  metric: (r: R) => number | null,
  mode: "max" | "min",
  keyOf: (r: R) => string
): { key: string; value: number; row: R } | null {
  let best: { row: R; value: number } | null = null;
  for (const rr of rows) {
    const v = metric(rr);
    if (v == null || !Number.isFinite(v)) continue;
    if (!best) {
      best = { row: rr, value: v };
      continue;
    }
    const cmp = mode === "max" ? v - best.value : best.value - v;
    if (cmp > 0) best = { row: rr, value: v };
    else if (cmp === 0 && keyOf(rr).localeCompare(keyOf(best.row)) < 0) best = { row: rr, value: v };
  }
  return best ? { key: keyOf(best.row), row: best.row, value: best.value } : null;
}

function categoryWithMaxSuperseded(rows: CategoryRollup[]): CategoryRollup | null {
  let best: CategoryRollup | null = null;
  for (const rr of rows) {
    if (rr.superseded_count <= 0) continue;
    if (!best || rr.superseded_count > best.superseded_count) best = rr;
    else if (best && rr.superseded_count === best.superseded_count && rr.categoryKey.localeCompare(best.categoryKey) < 0) {
      best = rr;
    }
  }
  return best;
}

function categoryDisplayLabel(k: string): string {
  return k === "unknown" ? "Unknown" : formatVoiceAiCallerCategoryLabel(k);
}

function sortRollupKeys(keys: string[]): string[] {
  const order = new Map(ROLLUP_CATEGORY_ORDER.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const ia = order.has(a) ? order.get(a)! : 999;
    const ib = order.has(b) ? order.get(b)! : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

function sortDimKeys(keys: string[], orderList: readonly string[]): string[] {
  const order = new Map(orderList.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const ia = order.has(a) ? order.get(a)! : 999;
    const ib = order.has(b) ? order.get(b)! : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

function accumulateDimRollup(
  map: Map<string, DimRollup>,
  dimKey: string,
  t: SmsSuggestionTelemetry
): void {
  const prev = map.get(dimKey);
  if (prev) {
    prev.conversations += 1;
    prev.shown_count += t.shown_count;
    prev.sent_unchanged_count += t.sent_unchanged_count;
    prev.sent_edited_count += t.sent_edited_count;
  } else {
    map.set(dimKey, {
      dimKey,
      conversations: 1,
      shown_count: t.shown_count,
      sent_unchanged_count: t.sent_unchanged_count,
      sent_edited_count: t.sent_edited_count,
    });
  }
}

function routeRollupLabel(k: string): string {
  if (k === "unknown") return "Unknown";
  return formatVoiceAiRouteTargetLabel(k);
}

function urgencyRollupLabel(k: string): string {
  if (k === "unknown") return "Unknown";
  return formatUrgencyLabel(k);
}

function callbackRollupLabel(k: string): string {
  if (k === "yes") return "Yes";
  if (k === "no") return "No";
  return "Unknown";
}

function CompactDimRollupTable(props: {
  title: string;
  firstColHeader: string;
  rows: DimRollup[];
  labelFor: (dimKey: string) => string;
}) {
  const { title, firstColHeader, rows, labelFor } = props;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 font-semibold text-slate-600">
              <th className="px-2 py-1.5">{firstColHeader}</th>
              <th className="px-2 py-1.5">conv</th>
              <th className="px-2 py-1.5">shown</th>
              <th className="px-2 py-1.5">sent ✓</th>
              <th className="px-2 py-1.5">sent edit</th>
              <th className="px-2 py-1.5">adoption</th>
              <th className="px-2 py-1.5">trust</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rr) => (
              <tr key={rr.dimKey} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-slate-800">{labelFor(rr.dimKey)}</td>
                <td className="px-2 py-1.5 font-mono">{rr.conversations}</td>
                <td className="px-2 py-1.5 font-mono">{rr.shown_count}</td>
                <td className="px-2 py-1.5 font-mono">{rr.sent_unchanged_count}</td>
                <td className="px-2 py-1.5 font-mono">{rr.sent_edited_count}</td>
                <td className="px-2 py-1.5">{formatPct(adoptionRateFromRollup(rr))}</td>
                <td className="px-2 py-1.5">{formatPct(trustRateFromRollup(rr))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

/** Of suggestions shown in UI, share sent unchanged (adoption). */
function adoptionRate(t: SmsSuggestionTelemetry): number | null {
  if (t.shown_count <= 0) return null;
  return (t.sent_unchanged_count / t.shown_count) * 100;
}

/** Of outbound sends that used an active suggestion, share sent unchanged (trust in copy). */
function trustRate(t: SmsSuggestionTelemetry): number | null {
  const denom = t.sent_unchanged_count + t.sent_edited_count;
  if (denom <= 0) return null;
  return (t.sent_unchanged_count / denom) * 100;
}

/** Of outbound sends that used an active suggestion, share edited before send. */
function editRate(t: SmsSuggestionTelemetry): number | null {
  const denom = t.sent_unchanged_count + t.sent_edited_count;
  if (denom <= 0) return null;
  return (t.sent_edited_count / denom) * 100;
}

function hasTelemetryActivity(t: SmsSuggestionTelemetry): boolean {
  return (
    t.generation_count > 0 ||
    t.shown_count > 0 ||
    t.sent_unchanged_count > 0 ||
    t.sent_edited_count > 0 ||
    t.superseded_count > 0 ||
    t.sent_no_active_suggestion_count > 0
  );
}

export default async function SmsSuggestionTelemetryPage() {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff) || !staff.phone_access_enabled || !isAdminOrHigher(staff)) {
    redirect("/admin/phone");
  }

  const { data: rows, error } = await supabaseAdmin
    .from("conversations")
    .select("id, main_phone_e164, metadata")
    .eq("channel", "sms")
    .order("updated_at", { ascending: false })
    .limit(400);

  if (error) {
    console.warn("[admin/phone/sms-telemetry] load:", error.message);
  }

  type Row = {
    id: string;
    phone: string;
    telemetry: SmsSuggestionTelemetry;
    convMeta: Record<string, unknown> | null;
  };

  const list: Row[] = [];
  for (const r of rows ?? []) {
    const meta = asMeta(r.metadata);
    const raw = meta?.sms_suggestion_telemetry;
    const telemetry = parseSmsSuggestionTelemetry(raw);
    if (!hasTelemetryActivity(telemetry)) continue;
    list.push({
      id: String(r.id),
      phone: typeof r.main_phone_e164 === "string" && r.main_phone_e164.trim() ? r.main_phone_e164 : "—",
      telemetry,
      convMeta: meta,
    });
  }

  const phones = [...new Set(list.map((row) => row.phone).filter((p) => p !== "—"))];
  const latestCallMetaByPhone = new Map<string, unknown>();
  if (phones.length > 0) {
    const { data: callRows, error: callErr } = await supabaseAdmin
      .from("phone_calls")
      .select("from_e164, metadata, created_at")
      .in("from_e164", phones)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (callErr) {
      console.warn("[admin/phone/sms-telemetry] phone_calls:", callErr.message);
    }
    for (const c of callRows ?? []) {
      const from = typeof c.from_e164 === "string" ? c.from_e164.trim() : "";
      if (!from || latestCallMetaByPhone.has(from)) continue;
      latestCallMetaByPhone.set(from, c.metadata);
    }
  }

  const rowsWithContext = list.map((row) => {
    const latestCallMeta = row.phone !== "—" ? latestCallMetaByPhone.get(row.phone) : undefined;
    const ctx = { convMeta: row.convMeta, latestCallMeta };
    const categoryKey = resolveRowCallerCategoryKey(ctx);
    const routeKey = resolveRouteTargetKey(ctx);
    const urgencyKey = resolveUrgencyKey(ctx);
    const callbackKey = resolveCallbackKey(ctx);
    return { ...row, categoryKey, routeKey, urgencyKey, callbackKey };
  });

  const rollupByKey = new Map<string, CategoryRollup>();
  const rollupRouteByKey = new Map<string, DimRollup>();
  const rollupUrgencyByKey = new Map<string, DimRollup>();
  const rollupCallbackByKey = new Map<string, DimRollup>();

  for (const row of rowsWithContext) {
    const t = row.telemetry;
    const k = row.categoryKey;
    const prev = rollupByKey.get(k);
    if (prev) {
      prev.conversations += 1;
      prev.generation_count += t.generation_count;
      prev.shown_count += t.shown_count;
      prev.sent_unchanged_count += t.sent_unchanged_count;
      prev.sent_edited_count += t.sent_edited_count;
      prev.superseded_count += t.superseded_count;
    } else {
      rollupByKey.set(k, {
        categoryKey: k,
        conversations: 1,
        generation_count: t.generation_count,
        shown_count: t.shown_count,
        sent_unchanged_count: t.sent_unchanged_count,
        sent_edited_count: t.sent_edited_count,
        superseded_count: t.superseded_count,
      });
    }
    accumulateDimRollup(rollupRouteByKey, row.routeKey, t);
    accumulateDimRollup(rollupUrgencyByKey, row.urgencyKey, t);
    accumulateDimRollup(rollupCallbackByKey, row.callbackKey, t);
  }
  const rollupRows = sortRollupKeys([...rollupByKey.keys()]).map((k) => rollupByKey.get(k)!);
  const rollupRouteRows = sortDimKeys([...rollupRouteByKey.keys()], ROLLUP_ROUTE_ORDER).map(
    (k) => rollupRouteByKey.get(k)!
  );
  const rollupUrgencyRows = sortDimKeys([...rollupUrgencyByKey.keys()], ROLLUP_URGENCY_ORDER).map(
    (k) => rollupUrgencyByKey.get(k)!
  );
  const rollupCallbackRows = sortDimKeys([...rollupCallbackByKey.keys()], ROLLUP_CALLBACK_ORDER).map(
    (k) => rollupCallbackByKey.get(k)!
  );

  const topTrustCategory = pickExtremeByMetric(rollupRows, trustRateFromRollup, "max", (r) => r.categoryKey);
  const lowTrustCategory = pickExtremeByMetric(rollupRows, trustRateFromRollup, "min", (r) => r.categoryKey);
  const highAdoptionRoute = pickExtremeByMetric(rollupRouteRows, adoptionRateFromRollup, "max", (r) => r.dimKey);
  const lowAdoptionRoute = pickExtremeByMetric(rollupRouteRows, adoptionRateFromRollup, "min", (r) => r.dimKey);
  const highEditUrgency = pickExtremeByMetric(rollupUrgencyRows, editRateFromRollup, "max", (r) => r.dimKey);
  const maxSupersededCategory = categoryWithMaxSuperseded(rollupRows);

  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone CRM · internal</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">SMS suggestion telemetry</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Read-only counters from <code className="text-xs">conversations.metadata.sms_suggestion_telemetry</code>.
          Category = latest <code className="text-xs">phone_calls.metadata</code> (voice AI / CRM) for the thread
          number, else conversation metadata, else unknown. Route / urgency / callback ={" "}
          <code className="text-xs">metadata.voice_ai</code> on the latest call for that number, else conversation
          metadata, else unknown. Adoption = sent unchanged ÷ shown; trust = unchanged ÷ (unchanged + edited); edit
          rate = edited ÷ (unchanged + edited).
        </p>
        <Link
          href="/admin/phone/messages"
          className="mt-3 inline-block text-sm font-semibold text-sky-800 underline"
        >
          ← SMS inbox
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-slate-600">No conversations with telemetry yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Top opportunities</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              Extremes from rollups below (trust / adoption / edit % need a non-empty denominator). Superseded = sum of
              per-thread superseded counts by category.
            </p>
            <dl className="mt-2 grid gap-x-4 gap-y-2 text-xs text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-600">Highest trust (category)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {topTrustCategory
                    ? `${categoryDisplayLabel(topTrustCategory.key)} · ${formatPct(topTrustCategory.value)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Lowest trust (category)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {lowTrustCategory
                    ? `${categoryDisplayLabel(lowTrustCategory.key)} · ${formatPct(lowTrustCategory.value)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Highest adoption (route)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {highAdoptionRoute
                    ? `${routeRollupLabel(highAdoptionRoute.key)} · ${formatPct(highAdoptionRoute.value)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Lowest adoption (route)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {lowAdoptionRoute
                    ? `${routeRollupLabel(lowAdoptionRoute.key)} · ${formatPct(lowAdoptionRoute.value)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Highest edit % (urgency)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {highEditUrgency
                    ? `${urgencyRollupLabel(highEditUrgency.key)} · ${formatPct(highEditUrgency.value)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600">Most superseded (category)</dt>
                <dd className="mt-0.5 font-mono text-[11px]">
                  {maxSupersededCategory
                    ? `${categoryDisplayLabel(maxSupersededCategory.categoryKey)} · ${maxSupersededCategory.superseded_count} total`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">By caller category</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-2 py-1.5">Category</th>
                    <th className="px-2 py-1.5">conv</th>
                    <th className="px-2 py-1.5">gen</th>
                    <th className="px-2 py-1.5">shown</th>
                    <th className="px-2 py-1.5">sent ✓</th>
                    <th className="px-2 py-1.5">sent edit</th>
                    <th className="px-2 py-1.5">adoption</th>
                    <th className="px-2 py-1.5">trust</th>
                  </tr>
                </thead>
                <tbody>
                  {rollupRows.map((rr) => (
                    <tr key={rr.categoryKey} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-1.5 text-slate-800">
                        {rr.categoryKey === "unknown"
                          ? "Unknown"
                          : formatVoiceAiCallerCategoryLabel(rr.categoryKey)}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{rr.conversations}</td>
                      <td className="px-2 py-1.5 font-mono">{rr.generation_count}</td>
                      <td className="px-2 py-1.5 font-mono">{rr.shown_count}</td>
                      <td className="px-2 py-1.5 font-mono">{rr.sent_unchanged_count}</td>
                      <td className="px-2 py-1.5 font-mono">{rr.sent_edited_count}</td>
                      <td className="px-2 py-1.5">{formatPct(adoptionRateFromRollup(rr))}</td>
                      <td className="px-2 py-1.5">{formatPct(trustRateFromRollup(rr))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <CompactDimRollupTable
              title="By route target (voice AI)"
              firstColHeader="Route"
              rows={rollupRouteRows}
              labelFor={routeRollupLabel}
            />
            <CompactDimRollupTable
              title="By urgency (voice AI)"
              firstColHeader="Urgency"
              rows={rollupUrgencyRows}
              labelFor={urgencyRollupLabel}
            />
            <CompactDimRollupTable
              title="By callback needed (voice AI)"
              firstColHeader="Callback"
              rows={rollupCallbackRows}
              labelFor={callbackRollupLabel}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">gen</th>
                <th className="px-3 py-2">shown</th>
                <th className="px-3 py-2">sent ✓</th>
                <th className="px-3 py-2">sent edited</th>
                <th className="px-3 py-2">super.</th>
                <th className="px-3 py-2">no sugg.</th>
                <th className="px-3 py-2">adoption</th>
                <th className="px-3 py-2">trust</th>
                <th className="px-3 py-2">edit %</th>
                <th className="px-3 py-2">last event</th>
                <th className="px-3 py-2">thread</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithContext.map((row) => {
                const t = row.telemetry;
                const lastAt = t.last_event_at ? formatAdminPhoneWhen(t.last_event_at) : "—";
                const catLabel =
                  row.categoryKey === "unknown" ? "—" : formatVoiceAiCallerCategoryLabel(row.categoryKey);
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-xs text-slate-700">{catLabel}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800">{row.phone}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.generation_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.shown_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.sent_unchanged_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.sent_edited_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.superseded_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.sent_no_active_suggestion_count}</td>
                    <td className="px-3 py-2 text-xs">{formatPct(adoptionRate(t))}</td>
                    <td className="px-3 py-2 text-xs">{formatPct(trustRate(t))}</td>
                    <td className="px-3 py-2 text-xs">{formatPct(editRate(t))}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">
                      <span className="font-mono">{t.last_event ?? "—"}</span>
                      <span className="block text-[10px] text-slate-500">{lastAt}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/phone/messages/${row.id}`}
                        className="text-xs font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
