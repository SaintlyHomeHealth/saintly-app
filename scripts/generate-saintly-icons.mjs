/**
 * Favicon + PWA outputs from public/brand/saintly-icon-master.svg
 *
 * - "Any" icons (tab, apple, PWA): tight-cropped SVG → transparent PNG (mark fills frame).
 * - Maskable only: same raster shrunk on white 512² for Android safe zone (extra padding).
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
  return sharp(svgBuf)
    .resize(RASTER, RASTER, { fit: "fill", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Maskable: smaller mark + more breathing room for circular masks (different from tab favicon). */
async function buildMaskable512(master1024) {
  const inner = 268;
  const innerBuf = await sharp(master1024)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
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
    ["public/favicon-16x16.png", 16],
    ["public/favicon-32x32.png", 32],
    ["public/apple-touch-icon.png", 180],
    ["public/android-chrome-192x192.png", 192],
    ["public/android-chrome-512x512.png", 512],
  ];

  const resizeSquare = (buf, px) =>
    sharp(buf).resize(px, px, { fit: "fill", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();

  for (const [rel, size] of outputs) {
    const outPath = join(ROOT, rel);
    mkdirSync(dirname(outPath), { recursive: true });
    await resizeSquare(masterBuf, size).toFile(outPath);
    console.log("Wrote", outPath);
  }

  const maskBuf = await buildMaskable512(masterBuf);
  const maskPath = join(ROOT, "public/android-chrome-512x512-maskable.png");
  writeFileSync(maskPath, maskBuf);
  console.log("Wrote", maskPath);

  for (const [name, px] of [
    ["icon-preview-16.png", 16],
    ["icon-preview-32.png", 32],
    ["icon-preview-48.png", 48],
    ["icon-preview-64.png", 64],
  ]) {
    const p = join(brandDir, name);
    await resizeSquare(masterBuf, px).toFile(p);
    console.log("Wrote", p);
  }

  const tmp16 = join(tmpdir(), "saintly-favicon-16.png");
  const tmp32 = join(tmpdir(), "saintly-favicon-32.png");
  await resizeSquare(masterBuf, 16).toFile(tmp16);
  await resizeSquare(masterBuf, 32).toFile(tmp32);

  const faviconIcoPublic = join(ROOT, "public/favicon.ico");
  execSync(`npx --yes png-to-ico "${tmp16}" "${tmp32}" > "${faviconIcoPublic}"`, { cwd: ROOT, stdio: "inherit" });
  try {
    unlinkSync(tmp16);
    unlinkSync(tmp32);
  } catch {
    /* ignore */
  }
  console.log("Wrote", faviconIcoPublic);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
