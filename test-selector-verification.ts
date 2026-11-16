import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

async function testSelector() {
  const url = "https://zealy.io/cw/lynxcap/questboard"; // Using lynxcap URL

  console.log("🚀 Testing selector with lynxcap URL...");
  console.log(`📍 ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/36",
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    // Run the EXTRACT_QUEST_CARDS_SCRIPT logic with our updated selector
    const cardData = await page.evaluate(() => {
      const cards = document.querySelectorAll(
        'div[class*="quest-card"], div[class*="z-0"], div[class*="quest-card-gradient"], ' +
        'div[data-state], div[type="button"][class*="quest-card"]'
      );
      return Array.from(cards as any).map((card: any) => {
        const innerAnchors = card.querySelectorAll('a[href*="/questboard/"]');
        let href = '';
        let id = card.id;

        if (innerAnchors.length > 0) {
          const anchor = card.querySelector('a[href*="/questboard/"]') as HTMLAnchorElement;
          href = anchor.href;
          id = anchor.id || id;
        } else {
          const idAttr = card.getAttribute('data-id') || card.getAttribute('data-quest-id');
          if (idAttr) {
            href = 'https://zealy.io/quest/' + idAttr;
          } else {
            const classMatch = card.className.match(/quest-card-(\S+)/i);
            if (classMatch?.[1]) {
              id = classMatch[1];
              href = 'https://zealy.io/quest/' + id;
            }
          }
        }

        if (!id && !href) return null;

        return {
          id,
          href,
          innerHTML: card.innerHTML,
          innerText: card.innerText || card.textContent || '',
        };
      }).filter(Boolean);
    });

    console.log(`\n📋 Found ${cardData.length} quest cards`);
    for (const c of cardData.slice(0, 10) as any[]) {
      console.log(`  • ID: ${c?.id || "(none)"}`);
      console.log(`    HREF: ${c?.href || "(none)"}`);
      console.log(`    Text: ${(c?.innerText || "(empty)").slice(0, 100)}`);
      console.log();
    }

    if (cardData.length === 0) {
      // Try broader selector - look for any anchors with /questboard/
      const allAnchors = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map((a: any) => ({
          href: a.href,
          id: a.id || '(none)',
          text: (a.innerText || '').slice(0, 80),
        })).filter(a => a.href.includes('/questboard/') || a.href.includes('/quest/'));
      });
      console.log(`\n🔗 Questboard/quest anchors found: ${allAnchors.length}`);
      for (const a of allAnchors.slice(0, 20) as any[]) {
        console.log(`  • ${a?.href || "(none)"} ID: ${a?.id || "(none)"} Text: "${a?.text || "(empty)"}"`);
      }

      if (allAnchors.length === 0) {
        console.log("\n  No anchors found at all. Page may be blocking or not loaded.");
        const title = await page.title();
        console.log(`  Page title: ${title}`);
        const bodyText = await page.textContent('body').catch(() => '');
        console.log(`  Body preview: ${(bodyText || '').slice(0, 500)}`);
      }
    }

    // Save debug
    await page.screenshot({ path: path.join(process.cwd(), "test-screenshot.png"), fullPage: true });
    fs.writeFileSync(path.join(process.cwd(), "test-page.html"), await page.content());
    console.log("\n💾 Saved: test-screenshot.png, test-page.html");

  } catch (e) {
    console.error("Error:", e);
  } finally {
    await browser.close();
  }
}

testSelector();