import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  COMPLIANCE_PROGRAM_PDF_FILENAME,
  generateComplianceProgramMaterialsPdf,
} from "../src/lib/marketing/compliance-program-pdf";

async function main() {
  const outputArg = process.argv[2];
  const outputPath = outputArg
    ? join(process.cwd(), outputArg)
    : join(process.cwd(), COMPLIANCE_PROGRAM_PDF_FILENAME);

  const pdf = await generateComplianceProgramMaterialsPdf();
  await writeFile(outputPath, pdf);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
