/**
 * Favicon + PWA outputs from ONE raster master (blue-background Saintly mark).
 *
 * Master (you replace this file when the artwork updates):
 *   public/brand/saintly-app-icon-master.png
 *   Prefer 1024×1024+ square PNG. Script normalizes to 1024×1024 for derivatives only.
 *
 * Optional vector reference (not used by this script): public/brand/saintly-mark-favicon.svg
 *
 * Run: npm run icons:generate
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BRAND_BLUE = "#0284c7";

/** Canonical favicon/PWA master — blue-background Saintly icon */
const MASTER_PNG = join(ROOT, "public/brand/saintly-app-icon-master.png");

const MASTER_INTERNAL = 1024;

async function loadMasterBuffer() {
  if (!existsSync(MASTER_PNG)) {
    console.error("Missing master PNG. Add:", MASTER_PNG);
    process.exit(1);
  }
  return sharp(MASTER_PNG)
    .resize(MASTER_INTERNAL, MASTER_INTERNAL, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

async function buildMaskable512(master1024) {
  const inner = 296;
  const innerBuf = await sharp(master1024).resize(inner, inner, { fit: "fill" }).png().toBuffer();
  const pad = Math.round((512 - inner) / 2);
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: BRAND_BLUE,
    },
  })
    .composite([{ input: innerBuf, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function main() {
  const masterBuf = await loadMasterBuffer();

  const brandDir = join(ROOT, "public/brand");
  mkdirSync(brandDir, { recursive: true });

  const outputs = [
    ["public/favicon.png", 512],
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["src/app/icon.png", 512],
    ["src/app/apple-icon.png", 180],
  ];

  for (const [rel, size] of outputs) {
    const outPath = join(ROOT, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    await sharp(masterBuf).resize(size, size, { fit: "fill" }).png().toFile(outPath);
    console.log("Wrote", outPath);
  }

  const maskBuf = await buildMaskable512(masterBuf);
  const maskPath = join(ROOT, "public/icon-512-maskable.png");
  writeFileSync(maskPath, maskBuf);
  console.log("Wrote", maskPath);

  const preview16 = join(brandDir, "icon-preview-16.png");
  const preview32 = join(brandDir, "icon-preview-32.png");
  const preview64 = join(brandDir, "icon-preview-64.png");
  await sharp(masterBuf).resize(16, 16, { fit: "fill" }).png().toFile(preview16);
  await sharp(masterBuf).resize(32, 32, { fit: "fill" }).png().toFile(preview32);
  await sharp(masterBuf).resize(64, 64, { fit: "fill" }).png().toFile(preview64);
  console.log("Wrote", preview16, preview32, preview64, "(QA: tiny-size check)");

  const tmp32 = join(tmpdir(), "saintly-favicon-32.png");
  const tmp48 = join(tmpdir(), "saintly-favicon-48.png");
  await sharp(masterBuf).resize(32, 32, { fit: "fill" }).png().toFile(tmp32);
  await sharp(masterBuf).resize(48, 48, { fit: "fill" }).png().toFile(tmp48);

  const faviconIco = join(ROOT, "src/app/favicon.ico");
  const faviconIcoPublic = join(ROOT, "public/favicon.ico");
  execSync(`npx --yes png-to-ico "${tmp32}" "${tmp48}" > "${faviconIco}"`, { cwd: ROOT, stdio: "inherit" });
  writeFileSync(faviconIcoPublic, readFileSync(faviconIco));
  try {
    unlinkSync(tmp32);
    unlinkSync(tmp48);
  } catch {
    /* ignore */
  }
  console.log("Wrote", faviconIco, faviconIcoPublic);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
