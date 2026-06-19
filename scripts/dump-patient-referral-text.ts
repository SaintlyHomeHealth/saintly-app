import { readFileSync, writeFileSync } from "node:fs";

process.env.NODE_ENV ??= "development";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: tsx scripts/dump-patient-referral-text.ts <pdf>");
    process.exit(1);
  }
  const buf = readFileSync(path);
  const { extractPatientReferralPdfText } = await import("../src/lib/crm/patient-referral/pdf-text-extract");
  const r = await extractPatientReferralPdfText(buf);
  writeFileSync("src/lib/crm/patient-referral/fixtures/tango-lerma-real-extract.txt", r.text);
  console.log("chars:", r.text.length, "method:", r.method);
  console.log(r.text);
}

main();
