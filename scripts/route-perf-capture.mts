/**
 * Collect [route-perf] timings from a local dev server with an authenticated session.
 *
 * Prereqs (add to .env.local or export for one run):
 *   ROUTE_PERF_EMAIL=<staff email with access to workspace + admin SMS + /admin>
 *   ROUTE_PERF_PASSWORD=<password>
 *   ROUTE_PERF_LEAD_ID=<optional lead uuid for /admin/crm/leads/[leadId]>
 *   ROUTE_PERF_CONVERSATION_ID=<optional conversation uuid for /workspace/phone/inbox/[conversationId]>
 *
 * Usage:
 *   ROUTE_PERF_STEPS=1 NEXT_PUBLIC_ROUTE_PERF=1 npx tsx scripts/route-perf-capture.mts
 *
 * The script spawns `npm run dev` (same env), waits for readiness, signs in via Supabase SSR
 * cookie jar, then hits each route 5× sequentially and parses server stdout for [route-perf].
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function loadDotEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnvLocal();

const ROUTES = [
  "/workspace/phone",
  "/workspace/phone/inbox",
  "/workspace/phone/calls",
  "/workspace/phone/chat",
  "/workspace/phone/voicemail",
  process.env.ROUTE_PERF_CONVERSATION_ID?.trim()
    ? `/workspace/phone/inbox/${process.env.ROUTE_PERF_CONVERSATION_ID.trim()}`
    : null,
  "/admin/crm/leads",
  process.env.ROUTE_PERF_LEAD_ID?.trim()
    ? `/admin/crm/leads/${process.env.ROUTE_PERF_LEAD_ID.trim()}`
    : null,
  "/admin/phone/messages",
  "/admin",
].filter((x): x is string => Boolean(x));

const RUNS = 5;
const ORIGIN = (process.env.ROUTE_PERF_ORIGIN || "http://127.0.0.1:3000").replace(/\/$/, "");

type StepRow = { step: string; ms: number };
type RunRecord = { path: string; run: number; totalMs: number | null; steps: StepRow[] };

function parsePerfLines(lines: string[]): { totalMs: number | null; steps: StepRow[] } {
  let totalMs: number | null = null;
  const steps: StepRow[] = [];
  for (const line of lines) {
    const totalM = line.match(/\[route-perf\]\s+(.+?)\s+total=([\d.]+)ms/);
    if (totalM) {
      totalMs = Number(totalM[2]);
      continue;
    }
    const stepM = line.match(/\[route-perf\]\s+step\s+(\S+)\s+([\d.]+)ms/);
    if (stepM) steps.push({ step: stepM[1], ms: Number(stepM[2]) });
  }
  return { totalMs, steps };
}

function summarizeRuns(records: RunRecord[]) {
  const byPath = new Map<string, RunRecord[]>();
  for (const r of records) {
    const list = byPath.get(r.path) ?? [];
    list.push(r);
    byPath.set(r.path, list);
  }

  for (const p of ROUTES) {
    const list = byPath.get(p) ?? [];
    console.log(`\n=== ${p} (${list.length} runs) ===`);
    if (list.length === 0) {
      console.log("  (no data — check auth or server logs)");
      continue;
    }
    const totals = list.map((r) => r.totalMs).filter((x): x is number => x != null);
    if (totals.length) {
      const sorted = [...totals].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      console.log(
        `  total ms: min=${sorted[0]} max=${sorted[sorted.length - 1]} median=${med} samples=${totals.length}`
      );
    }
    const stepAgg = new Map<string, number[]>();
    for (const r of list) {
      for (const { step, ms } of r.steps) {
        const arr = stepAgg.get(step) ?? [];
        arr.push(ms);
        stepAgg.set(step, arr);
      }
    }
    const medians = [...stepAgg.entries()].map(([step, arr]) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = s[Math.floor(s.length / 2)];
      return { step, median: m, max: s[s.length - 1], n: arr.length };
    });
    medians.sort((a, b) => b.median - a.median);
    console.log("  steps (by median ms, desc):");
    for (const { step, median, max, n } of medians) {
      console.log(`    ${step}: median=${median}ms max=${max}ms n=${n}`);
    }
    if (medians.length >= 1) console.log(`  slowest: ${medians[0].step}`);
    if (medians.length >= 2) console.log(`  2nd slowest: ${medians[1].step}`);
  }
}

async function waitForServerReady(child: ChildProcessWithoutNullStreams, timeoutMs: number) {
  const chunks: string[] = [];
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`Dev server not ready within ${timeoutMs}ms. Output tail:\n${chunks.join("").slice(-2000)}`));
    }, timeoutMs);

    const onData = (buf: Buffer) => {
      const s = buf.toString();
      chunks.push(s);
      if (/Ready in|started server|Local:\s*http/i.test(chunks.join(""))) {
        clearTimeout(t);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
  });
}

async function main() {
  const email = process.env.ROUTE_PERF_EMAIL?.trim();
  const password = process.env.ROUTE_PERF_PASSWORD ?? "";
  if (!email || !password) {
    console.error(
      "Missing ROUTE_PERF_EMAIL / ROUTE_PERF_PASSWORD. Add them to .env.local (temporary) or export for this command."
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const perfEnv = {
    ...process.env,
    ROUTE_PERF_STEPS: "1",
    NEXT_PUBLIC_ROUTE_PERF: "1",
  };

  console.info("Starting dev server (npm run dev) with ROUTE_PERF_STEPS=1 …");
  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    env: perfEnv,
    shell: true,
  });

  const logLines: string[] = [];
  const pushChunk = (buf: Buffer) => {
    for (const line of buf.toString().split("\n")) {
      if (line.trim()) logLines.push(line);
    }
  };
  child.stdout?.on("data", pushChunk);
  child.stderr?.on("data", pushChunk);

  try {
    await waitForServerReady(child, 120_000);
  } catch (e) {
    child.kill("SIGTERM");
    throw e;
  }

  console.info("Dev server ready. Signing in…");

  const cookieStore: { name: string; value: string }[] = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const c of cookiesToSet) {
          const i = cookieStore.findIndex((x) => x.name === c.name);
          if (i >= 0) cookieStore[i] = { name: c.name, value: c.value };
          else cookieStore.push({ name: c.name, value: c.value });
        }
      },
    },
  });

  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signErr) {
    child.kill("SIGTERM");
    console.error("Sign-in failed:", signErr.message);
    process.exit(1);
  }

  const cookieHeader = cookieStore.map((c) => `${c.name}=${c.value}`).join("; ");

  const records: RunRecord[] = [];
  const cursorStart = logLines.length;

  for (const routePath of ROUTES) {
    for (let run = 1; run <= RUNS; run++) {
      const before = logLines.length;
      const res = await fetch(`${ORIGIN}${routePath}`, {
        redirect: "manual",
        headers: {
          Cookie: cookieHeader,
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        console.warn(`  ${routePath} run ${run}: HTTP ${res.status} (redirect — session may lack access)`);
      }
      await new Promise((r) => setTimeout(r, 350));
      const chunk = logLines.slice(before);
      const { totalMs, steps } = parsePerfLines(chunk);
      records.push({ path: routePath, run, totalMs, steps });
    }
  }

  child.kill("SIGTERM");

  const relevant = logLines.slice(cursorStart).filter((l) => l.includes("[route-perf]"));
  console.log("\n--- Raw [route-perf] lines captured ---\n");
  for (const l of relevant) console.log(l);

  summarizeRuns(records);
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
