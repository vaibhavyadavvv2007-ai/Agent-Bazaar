/**
 * MAKE GIF — stitches screenshots into docs/preview.gif
 *
 * Usage: npx tsx scripts/make-gif.ts
 */

import GIFEncoder from "gif-encoder-2";
import { PNG } from "pngjs";
import { readFileSync, readdirSync, createWriteStream } from "fs";
import { join } from "path";

const SCREENSHOTS_DIR = join(process.cwd(), "docs", "screenshots");
const OUTPUT = join(process.cwd(), "docs", "preview.gif");
const FRAME_DELAY = 2000; // ms per frame
const SCALE = 0.5; // scale down for GIF size

async function main() {
  const files = readdirSync(SCREENSHOTS_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();

  if (files.length === 0) {
    console.error("No PNG files found in docs/screenshots/");
    process.exit(1);
  }

  console.log(`Creating GIF from ${files.length} frames…`);

  // Read first image to get dimensions
  const first = PNG.sync.read(readFileSync(join(SCREENSHOTS_DIR, files[0])));
  const width = Math.round(first.width * SCALE);
  const height = Math.round(first.height * SCALE);

  const encoder = new GIFEncoder(width, height);
  const stream = createWriteStream(OUTPUT);
  encoder.createReadStream().pipe(stream);
  encoder.start();
  encoder.setDelay(FRAME_DELAY);
  encoder.setRepeat(0); // loop forever

  for (const file of files) {
    const png = PNG.sync.read(readFileSync(join(SCREENSHOTS_DIR, file)));

    // Scale down using simple nearest-neighbor
    const scaled = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcX = Math.min(Math.round(x / SCALE), png.width - 1);
        const srcY = Math.min(Math.round(y / SCALE), png.height - 1);
        const srcIdx = (srcY * png.width + srcX) << 2;
        const dstIdx = (y * width + x) << 2;
        scaled.data[dstIdx] = png.data[srcIdx];
        scaled.data[dstIdx + 1] = png.data[srcIdx + 1];
        scaled.data[dstIdx + 2] = png.data[srcIdx + 2];
        scaled.data[dstIdx + 3] = png.data[srcIdx + 3];
      }
    }

    encoder.addFrame(scaled.data);
    console.log(`  + ${file}`);
  }

  encoder.finish();
  console.log(`\nDone → ${OUTPUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
