import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Campaigns page
  try {
    console.log("capturing campaigns...");
    const resp = await page.goto("http://localhost:3000/campaigns", {
      waitUntil: "load",
      timeout: 15000,
    });
    console.log("campaigns status:", resp?.status());
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "docs/screenshots/02-campaigns.png", fullPage: true });
    console.log("02-campaigns done");
  } catch (e) {
    console.log("02-campaigns failed:", (e as Error).message?.slice(0, 120));
  }

  // Catalog page
  try {
    console.log("capturing catalog...");
    const resp = await page.goto("http://localhost:3000/api/catalog?format=agent", {
      waitUntil: "load",
      timeout: 15000,
    });
    console.log("catalog status:", resp?.status());
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "docs/screenshots/06-mcp.png" });
    console.log("06-mcp done");
  } catch (e) {
    console.log("06-mcp failed:", (e as Error).message?.slice(0, 120));
  }

  await browser.close();
  console.log("all done");
}

main();
