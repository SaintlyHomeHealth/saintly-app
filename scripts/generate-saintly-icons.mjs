/**
 * Rasterizes the hand-tuned SVG mark (thick strokes / filled shapes) for favicon + PWA.
 * Do NOT use the thin outline PNG as the icon source — see public/brand/saintly-mark-favicon.svg
 *
 * Master PNG output: public/brand/saintly-app-icon-master.png
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

/** Vector source of truth — bold house + halo + dome, readable at 16px+ */
const SVG_MASTER = join(ROOT, "public/brand/saintly-mark-favicon.svg");

async function rasterizeMaster(size) {
  const svgBuf = readFileSync(SVG_MASTER);
  return sharp(svgBuf).resize(size, size, { fit: "fill" }).png().toBuffer();
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
  if (!existsSync(SVG_MASTER)) {
    console.error("Missing SVG master:", SVG_MASTER);
    process.exit(1);
  }

  const masterSize = 1024;
  const masterBuf = await rasterizeMaster(masterSize);

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

  const maskBuf = await buildMaskable512(masterBuf);
  const maskPath = join(ROOT, "public/icon-512-maskable.png");
  writeFileSync(maskPath, maskBuf);
  console.log("Wrote", maskPath);

  const preview32 = join(brandDir, "icon-preview-32.png");
  const preview64 = join(brandDir, "icon-preview-64.png");
  await sharp(masterBuf).resize(32, 32, { fit: "fill" }).png().toFile(preview32);
  await sharp(masterBuf).resize(64, 64, { fit: "fill" }).png().toFile(preview64);
  console.log("Wrote", preview32, preview64, "(QA: open to verify house reads at tiny size)");

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
