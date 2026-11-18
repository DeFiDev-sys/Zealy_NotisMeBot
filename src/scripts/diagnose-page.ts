/**
 * Diagnostics script to analyze a Zealy page structure.
 *
 * Usage:
 *   npx tsx src/scripts/diagnose-page.ts <project-url>
 *
 * Example:
 *   npx tsx src/scripts/diagnose-page.ts https://zealy.io/questboard/myproject
 *
 * This script will:
 * 1. Navigate to the URL and wait for content
 * 2. Report detailed element counts for common quest selectors
 * 3. Show sample anchors found on the page
 * 4. List API calls made by the page
 * 5. Report any console errors
 * 6. Save a full HTML dump and screenshot
 */
import { ZealyQuestScraper } from "../scraper/zealy-scraper";
import * as fs from "fs";
import * as path from "path";
import { PageDiagnostics } from "../scraper/zealy-scraper";

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("❌ Usage: npx tsx src/scripts/diagnose-page.ts <project-url>");
    console.error("Example: npx tsx src/scripts/diagnose-page.ts https://zealy.io/questboard/myproject");
    process.exit(1);
  }

  console.log("🔬 Starting Zealy page diagnostics...");
  console.log(`📍 Target URL: ${url}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);

  const scraper = new ZealyQuestScraper();

  try {
    console.log("🔧 Initializing browser...");
    await scraper.initialize();

    console.log("\n📡 Running diagnostics...\n");
    const diagnostics: PageDiagnostics = await scraper.diagnose(url);

    console.log("=" .repeat(70));
    console.log("📋 PAGE DIAGNOSTICS");
    console.log("=" .repeat(70));

    console.log(`\n📄 Title: ${diagnostics.title}`);
    console.log(`🔗 URL: ${diagnostics.url}`);
    console.log(`📊 HTTP Status: ${diagnostics.httpStatus ?? "N/A"}`);
    console.log(`📏 HTML Length: ${diagnostics.htmlLength.toLocaleString()} chars`);

    console.log("\n📦 Element Counts:");
    for (const [selector, count] of Object.entries(diagnostics.elementCounts)) {
      const status = count > 0 ? "✅" : count === -1 ? "❓" : "❌";
      console.log(`  ${status} ${selector}: ${count}`);
    }

    if (diagnostics.anchorSample.length > 0) {
      console.log("\n🔗 Questboard/Quest Anchors (sample):");
      for (const anchor of diagnostics.anchorSample) {
        console.log(`  • ${anchor.href}`);
        console.log(`      ID: ${anchor.id || "(none)"}`);
        console.log(`      Classes: ${anchor.classes || "(none)"}`);
        console.log(`      Text: ${anchor.text || "(empty)"}`);
        console.log();
      }
    } else {
      console.log("\n❌ No questboard/quest anchors found!");

      if (diagnostics.allAnchorSample.length > 0) {
        console.log("\n🔗 All Anchors on Page (sample):");
        for (const anchor of diagnostics.allAnchorSample) {
          console.log(`  • ${anchor.href} ${anchor.id ? `(#${anchor.id})` : ""}`);
          console.log(`      Text: ${anchor.text || "(empty)"}`);
        }
      }
    }

    if (diagnostics.apiCalls.length > 0) {
      console.log("\n🌐 API Calls Detected:");
      for (const call of diagnostics.apiCalls) {
        console.log(`  • ${call}`);
      }
    } else {
      console.log("\n🌐 No API calls detected (or all were filtered)");
    }

    if (diagnostics.consoleErrors.length > 0) {
      console.log("\n⚠️  Console Errors:");
      for (const error of diagnostics.consoleErrors) {
        console.log(`  • ${error}`);
      }
    }

    console.log("\n📄 Body Text Preview:");
    console.log(diagnostics.bodyTextPreview);

    // Save full diagnostics
    const output = {
      timestamp: new Date().toISOString(),
      url,
      diagnostics,
    };

    fs.writeFileSync(
      path.join(process.cwd(), "diagnostics.json"),
      JSON.stringify(output, null, 2)
    );

    // Save HTML
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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

    console.log("\n" + "=" .repeat(70));
    console.log("💾 Debug files saved:");
    console.log("  • diagnostics.json (full structured data)");
    console.log("  • debug-screenshot.png");
    console.log("  • debug-page.html (full HTML)");

  } catch (error) {
    console.error("\n💥 Fatal error during diagnostics:");
    console.error(error);

    if (error instanceof Error) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await scraper.close();
    console.log("\n✅ Browser closed. Diagnostics complete.");
  }
}

main();