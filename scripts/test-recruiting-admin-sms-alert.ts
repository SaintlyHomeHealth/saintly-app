/**
 * Dev smoke test for recruiting admin SMS alert (Twilio send only).
 * Run: RECRUITING_ADMIN_ALERT_PHONE=+19167963306 NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-recruiting-admin-sms-alert.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sendSms } from "../src/lib/twilio/send-sms";

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

async function main() {
  loadLocalEnv();
  const to = process.env.RECRUITING_ADMIN_ALERT_PHONE?.trim() || "+19167963306";
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://app.saintlyhomehealth.com";
  const body = [
    "New Saintly recruiting lead:",
    "SMS Alert Smoke Test",
    "Role: RN",
    "Phone: (916) 555-0100",
    "Email: test@example.com",
    "Source: Website Careers",
    `Open: ${base.replace(/\/$/, "")}/admin/recruiting-leads/test`,
  ].join("\n");

  const result = await sendSms({ to, body });
  console.log(JSON.stringify({ to, ok: result.ok, messageSid: result.ok ? result.messageSid : null, error: result.ok ? null : result.error }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
