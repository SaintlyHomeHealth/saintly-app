/**
 * Builds PWA/favicon assets from the line-art logo:
 * Saintly blue field + white mark + padding (not raw black-on-transparent resize).
 *
 * Master output: public/brand/saintly-app-icon-master.png
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

/** Sky-600 — readable, medical-friendly “Saintly blue” */
const BRAND_BLUE = "#0284c7";

const SOURCE = join(ROOT, "public/brand/saintly-logo-source.png");

/**
 * @param {Buffer} rgbaInput - PNG buffer
 * @param {number} canvasSize
 * @param {number} contentRatio — fraction of canvas used by logo bounding box (before centering)
 */
async function composeIcon(rgbaInput, canvasSize, contentRatio) {
  const inner = Math.round(canvasSize * contentRatio);
  const resized = await sharp(rgbaInput).resize(inner, inner, { fit: "inside" }).ensureAlpha().toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? inner;
  const h = meta.height ?? inner;

  const { data, info } = await sharp(resized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = a;
  }

  const whiteLogo = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const left = Math.round((canvasSize - w) / 2);
  const top = Math.round((canvasSize - h) / 2);

  return sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BRAND_BLUE,
    },
  })
    .composite([{ input: whiteLogo, left, top }])
    .png();
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error("Missing source:", SOURCE);
    process.exit(1);
  }

  const srcBuf = await sharp(SOURCE).ensureAlpha().toBuffer();

  const masterSize = 1024;
  /** ~14% padding each side → logo reads clearly at 16–32px */
  const standardRatio = 0.72;
  /** Smaller mark for Android maskable safe zone (~80% circle) */
  const maskableRatio = 0.52;

  const master = await composeIcon(srcBuf, masterSize, standardRatio);
  const masterBuf = await master.toBuffer();

  const brandDir = join(ROOT, "public/brand");
  mkdirSync(brandDir, { recursive: true });

  const masterPath = join(brandDir, "saintly-app-icon-master.png");
  writeFileSync(masterPath, masterBuf);
  console.log("Wrote", masterPath);

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

  const maskable512 = await composeIcon(srcBuf, 512, maskableRatio);
  const maskPath = join(ROOT, "public/icon-512-maskable.png");
  await maskable512.toFile(maskPath);
  console.log("Wrote", maskPath);

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
