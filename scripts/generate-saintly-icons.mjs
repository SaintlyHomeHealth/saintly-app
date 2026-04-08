/**
 * Favicon + PWA outputs from ONE vector master (transparent, black Saintly mark).
 *
 * Master: public/brand/saintly-icon-master.svg
 * Also writes: public/brand/saintly-app-icon-master.png (1024×1024 PNG export for reference)
 *
 * - Normal icons: transparent PNG (tab, apple, PWA "any")
 * - Maskable only: white background + scaled mark (Android safe zone; no blue tile)
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

/** Maskable tile: neutral light field (not brand blue) */
const MASKABLE_BG = "#ffffff";

const MASTER_SVG = join(ROOT, "public/brand/saintly-icon-master.svg");
const MASTER_PNG_EXPORT = join(ROOT, "public/brand/saintly-app-icon-master.png");

const RASTER = 1024;

async function rasterizeMaster() {
  if (!existsSync(MASTER_SVG)) {
    console.error("Missing master SVG:", MASTER_SVG);
    process.exit(1);
  }
  const svgBuf = readFileSync(MASTER_SVG);
  return sharp(svgBuf).resize(RASTER, RASTER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function buildMaskable512(master1024) {
  const inner = 280;
  const innerBuf = await sharp(master1024).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(innerBuf).metadata();
  const w = meta.width ?? inner;
  const h = meta.height ?? inner;
  const left = Math.round((512 - w) / 2);
  const top = Math.round((512 - h) / 2);
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: MASKABLE_BG,
    },
  })
    .composite([{ input: innerBuf, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  const masterBuf = await rasterizeMaster();
  writeFileSync(MASTER_PNG_EXPORT, masterBuf);
  console.log("Wrote", MASTER_PNG_EXPORT);

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
    await sharp(masterBuf).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath);
    console.log("Wrote", outPath);
  }

  const maskBuf = await buildMaskable512(masterBuf);
  const maskPath = join(ROOT, "public/icon-512-maskable.png");
  writeFileSync(maskPath, maskBuf);
  console.log("Wrote", maskPath);

  for (const [name, px] of [
    ["icon-preview-16.png", 16],
    ["icon-preview-32.png", 32],
    ["icon-preview-64.png", 64],
  ]) {
    const p = join(brandDir, name);
    await sharp(masterBuf).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(p);
    console.log("Wrote", p);
  }

  const tmp32 = join(tmpdir(), "saintly-favicon-32.png");
  const tmp48 = join(tmpdir(), "saintly-favicon-48.png");
  await sharp(masterBuf).resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(tmp32);
  await sharp(masterBuf).resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(tmp48);

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
