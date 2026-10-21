/**
 * Test script to verify the Zealy scraper works standalone.
 *
 * Usage:
 *   npx tsx src/scripts/scrape-test.ts <project-url>
 *
 * Example:
 *   npx tsx src/scripts/scrape-test.ts https://zealy.io/questboard/myproject
 *
 * This script will:
 * 1. Launch the Playwright browser
 * 2. Navigate to the provided URL
 * 3. Extract quests using all available strategies
 * 4. Log detailed debugging information
 * 5. Save a debug screenshot and page HTML for inspection
 */
import { ZealyQuestScraper } from "../scraper/zealy-scraper";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("❌ Usage: npx tsx src/scripts/scrape-test.ts <project-url>");
    console.error("Example: npx tsx src/scripts/scrape-test.ts https://zealy.io/questboard/myproject");
    process.exit(1);
  }

  console.log("🚀 Starting Zealy scraper test...");
  console.log(`📍 Target URL: ${url}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  const scraper = new ZealyQuestScraper();

  try {
    // Initialize browser
    console.log("🔧 Initializing browser...");
    await scraper.initialize();

    console.log("\n📡 Starting scan...\n");
    const startTime = Date.now();

    const result = await scraper.scanProject(url, "test-project", "Test Project", 0);

    const elapsed = Date.now() - startTime;

    console.log("\n" + "=".repeat(60));
    console.log("📊 SCAN RESULTS");
    console.log("=".repeat(60));
    console.log(`⏱️  Duration: ${elapsed}ms`);
    console.log(`📋 Status: ${result.status}`);
    console.log(`🎯 Quests Found: ${result.questsFound}`);
    console.log(`🆕 New Quests: ${result.newQuestsFound}`);

    if (result.errorMessage) {
      console.log(`⚠️  Error: ${result.errorMessage}`);
    }

    if (result.quests.length > 0) {
      console.log("\n📝 Quests:");
      for (const quest of result.quests) {
        console.log(`  • ${quest.questName} (${quest.reward || "No reward"})`);
        console.log(`    ID: ${quest.questId}`);
        console.log(`    URL: ${quest.questUrl}`);
      }
    } else {
      console.log("\n❌ No quests were found!");

      if (result.status === "suspicious") {
        console.log("\n💡 Debugging tips:");
        console.log("  1. Check if Zealy is showing a Cloudflare challenge page");
        console.log("  2. Verify the URL is correct and accessible");
        console.log("  3. Check the debug screenshot: debug-screenshot.png");
        console.log("  4. Check the page HTML: debug-page.html");
      }
    }

    console.log("\n" + "=".repeat(60));

    // Save debug screenshot and HTML using a fresh page
    console.log("\n📸 Capturing debug artifacts...");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({
      path: path.join(process.cwd(), "debug-screenshot.png"),
      fullPage: true,
    });
    const html = await page.content();
    fs.writeFileSync(path.join(process.cwd(), "debug-page.html"), html);
    await page.close();
    await context.close();
    await browser.close();

    console.log("\n💾 Debug files saved:");
    console.log("  • debug-screenshot.png");
    console.log("  • debug-page.html");

  } catch (error) {
    console.error("\n💥 Fatal error during scrape test:");
    console.error(error);

    if (error instanceof Error) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await scraper.close();
    console.log("\n✅ Browser closed. Test complete.");
  }
}

main();
