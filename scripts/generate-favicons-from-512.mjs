/**
 * Build favicon-16x16.png, favicon-32x32.png, and favicon.ico from
 * `public/android-chrome-512x512.png` only (sharp multi-step downscale for crisp line art).
 *
 * Run after replacing the 512 asset: `npm run icons:favicons-from-512`
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const src512 = join(ROOT, "public/android-chrome-512x512.png");

async function main() {
  if (!existsSync(src512)) {
    console.error("Missing", src512);
    process.exit(1);
  }

  const k = sharp.kernel.lanczos3;

  const mid128 = await sharp(src512).resize(128, 128, { kernel: k, fit: "fill" }).png().toBuffer();
  await sharp(mid128).resize(32, 32, { kernel: k, fit: "fill" }).png().toFile(join(ROOT, "public/favicon-32x32.png"));

  const mid64 = await sharp(src512).resize(64, 64, { kernel: k, fit: "fill" }).png().toBuffer();
  await sharp(mid64).resize(16, 16, { kernel: k, fit: "fill" }).png().toFile(join(ROOT, "public/favicon-16x16.png"));

  const ico = join(ROOT, "public/favicon.ico");
  const f16 = join(ROOT, "public/favicon-16x16.png");
  const f32 = join(ROOT, "public/favicon-32x32.png");
  execSync(`npx --yes png-to-ico "${f16}" "${f32}" > "${ico}"`, { cwd: ROOT, stdio: "inherit" });
  console.log("Wrote public/favicon-16x16.png, favicon-32x32.png, favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
