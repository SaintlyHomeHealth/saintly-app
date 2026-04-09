/**
 * Single source of truth: `public/icon-1024.png` (1024×1024+ master).
 * Downscale only — never upscale — to avoid blur.
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
const input = join(ROOT, "public/icon-1024.png");

const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function generate() {
  if (!existsSync(input)) {
    console.error("Missing master:", input);
    process.exit(1);
  }

  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const minSide = Math.min(w, h);
  if (minSide < 16) {
    console.error("Source too small:", w, h);
    process.exit(1);
  }

  const k = sharp.kernel.lanczos3;

  for (const s of sizes) {
    if (s.size > minSide) {
      console.error(`Refusing to upscale: need ${s.size}px but source min side is ${minSide}px`);
      process.exit(1);
    }
    await sharp(input)
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
  console.log("Icons generated cleanly (all from icon-1024.png)");
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
