/**
 * 1) Build `public/icon-1024.png` from `public/saintly-logo.png` (house + halo only, no wordmark):
 *    crop top region, white mark on #0B5FFF, centered with ~22.5% padding.
 * 2) Downscale to favicon / PWA sizes — always from 1024 master, never upscale.
 *
 * Run: npm run icons:generate-icons
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const SAINTLY_BLUE = { r: 11, g: 95, b: 255 }; // #0B5FFF
/** Top portion of square logo = mark only (excludes “SAINTLY” / “HOME HEALTH” below). */
const TOP_STRIP_FRAC = 0.52;
/** Target inner art ~77.5% of canvas → ~22.5% total breathing room. */
const INNER_FRAC = 1 - 0.225;
/** Pixels darker than this (on white) become white ink on blue. */
const LINE_LUM_THRESHOLD = 238;

const logoPath = join(ROOT, "public/saintly-logo.png");
const masterPath = join(ROOT, "public/icon-1024.png");

const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function buildMasterFromFullLogo() {
  if (!existsSync(logoPath)) {
    return false;
  }

  const meta = await sharp(logoPath).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 16 || H < 16) {
    throw new Error("saintly-logo.png too small");
  }

  const stripH = Math.floor(H * TOP_STRIP_FRAC);
  const square = Math.min(W, stripH);
  const left = Math.max(0, Math.floor((W - square) / 2));
  const top = 0;

  const { data, info } = await sharp(logoPath)
    .extract({ left, top, width: square, height: square })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const px = w * h;
  const out = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const o = i * ch;
    const lum = (data[o] + data[o + 1] + data[o + 2]) / 3;
    const j = i * 4;
    if (lum < LINE_LUM_THRESHOLD) {
      out[j] = 255;
      out[j + 1] = 255;
      out[j + 2] = 255;
      out[j + 3] = 255;
    } else {
      out[j] = SAINTLY_BLUE.r;
      out[j + 1] = SAINTLY_BLUE.g;
      out[j + 2] = SAINTLY_BLUE.b;
      out[j + 3] = 255;
    }
  }

  const inner = Math.round(1024 * INNER_FRAC);
  const markPng = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .resize(inner, inner, {
      kernel: sharp.kernel.lanczos3,
      fit: "inside",
      background: { ...SAINTLY_BLUE, alpha: 1 },
    })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { ...SAINTLY_BLUE, alpha: 1 },
    },
  })
    .composite([{ input: markPng, gravity: "center" }])
    .png()
    .toFile(masterPath);

  console.log("Wrote public/icon-1024.png (house mark, white on #0B5FFF, from saintly-logo.png)");
  return true;
}

async function generateDerivatives() {
  if (!existsSync(masterPath)) {
    console.error("Missing master:", masterPath);
    process.exit(1);
  }

  const meta = await sharp(masterPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const minSide = Math.min(w, h);
  if (minSide < 16) {
    console.error("Master too small:", w, h);
    process.exit(1);
  }

  const k = sharp.kernel.lanczos3;

  for (const s of sizes) {
    if (s.size > minSide) {
      console.error(`Refusing to upscale: need ${s.size}px but master min side is ${minSide}px`);
      process.exit(1);
    }
    await sharp(masterPath)
      .resize(s.size, s.size, { kernel: k, fit: "fill" })
      .png()
      .toFile(join(ROOT, "public", s.name));
    console.log("Wrote public/" + s.name);
  }

  const f16 = join(ROOT, "public/favicon-16x16.png");
  const f32 = join(ROOT, "public/favicon-32x32.png");
  const ico = join(ROOT, "public/favicon.ico");
  execSync(`npx --yes png-to-ico "${f16}" "${f32}" > "${ico}"`, { cwd: ROOT, stdio: "inherit" });
  console.log("Wrote public/favicon.ico");
}

async function main() {
  const built = await buildMasterFromFullLogo();
  if (!built && !existsSync(masterPath)) {
    console.error("Add public/saintly-logo.png or public/icon-1024.png");
    process.exit(1);
  }
  await generateDerivatives();
  console.log("Saintly icons generated (downscale only from icon-1024.png)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
