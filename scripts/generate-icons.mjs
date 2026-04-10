/**
 * Build `public/icon-1024.png` from `public/saintly-logo.png`:
 * letterbox to 1024² on white (preserves black-on-white artwork, no recoloring).
 * Downscale to favicon / PWA sizes — always from 1024 master, never upscale.
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

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

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

  await sharp(logoPath)
    .resize(1024, 1024, {
      fit: "contain",
      background: WHITE,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toFile(masterPath);

  console.log("Wrote public/icon-1024.png (letterboxed on white, from saintly-logo.png)");
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
