#!/usr/bin/env npx tsx
/**
 * CAPTURE PREVIEW — screenshots the key screens for a README GIF.
 *
 * Usage:
 *   npm run dev                              # Terminal 1
 *   npx tsx scripts/capture-preview.ts       # Terminal 2
 *
 * Output: docs/screenshots/01-bazaar.png … 06-dashboard.png
 * Then convert to GIF:
 *   ffmpeg -framerate 1 -i docs/screenshots/%02d-*.png -vf "scale=1200:-1,fps=0.5" docs/preview.gif
 *
 * Or use https://ezgif.com/maker to upload the PNGs and create a GIF.
 */

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "screenshots");

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const shots: { name: string; url: string; wait?: number; action?: () => Promise<void> }[] = [
    { name: "01-bazaar", url: "/", wait: 2000 },
    { name: "02-campaigns", url: "/campaigns", wait: 1500 },
    { name: "03-approvals", url: "/approvals", wait: 1500 },
    { name: "04-dashboard", url: "/dashboard", wait: 2000 },
    { name: "05-receipts", url: "/receipts", wait: 1500 },
    { name: "06-mcp", url: "/api/catalog?format=agent", wait: 1500 },
  ];

  console.log(`Capturing ${shots.length} screens from ${BASE}…`);

  for (const shot of shots) {
    console.log(`  → ${shot.name}`);
    try {
      await page.goto(`${BASE}${shot.url}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      if (shot.wait) await page.waitForTimeout(shot.wait);
      if (shot.action) await shot.action();
      await page.screenshot({
        path: join(OUT, `${shot.name}.png`),
        fullPage: shot.name === "06-mcp" ? false : true,
      });
    } catch (e) {
      console.log(`    ⚠ skipped (${(e as Error).message?.slice(0, 60)})`);
    }
  }

  await browser.close();
  console.log(`\nDone. Screenshots saved to ${OUT}/`);
  console.log(`\nTo create GIF, run:`);
  console.log(`  ffmpeg -framerate 0.5 -i ${OUT}/%02d-*.png -vf "scale=1200:-1" docs/preview.gif`);
  console.log(`\nOr upload the PNGs to https://ezgif.com/maker`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
