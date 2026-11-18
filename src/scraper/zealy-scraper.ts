import { chromium, Browser, Page, BrowserContext } from "playwright";
import { NormalizedQuest, ScanResult } from "../types";
import { buildNormalizedQuest } from "./quest-extractor";
import { isQuestAnchor, extractQuestIdFromAnchor } from "./selectors";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";

const logger = createLogger("zealy-scraper");

interface AnchorData {
  id: string;
  href: string;
  innerHTML: string;
  innerText: string;
  parentText?: string;
}

export interface PageDiagnostics {
  title: string;
  url: string;
  bodyTextPreview: string;
  htmlLength: number;
  elementCounts: Record<string, number>;
  anchorSample: Array<{ href: string; id: string | null; classes: string; text: string }>;
  allAnchorSample: Array<{ href: string; id: string | null; classes: string; text: string }>;
  httpStatus: number | null;
  apiCalls: string[];
  consoleErrors: string[];
}

const EXTRACT_ANCHORS_SCRIPT = `
(() => {
  // Find all anchors that might be quest links - match both /questboard/ and /cw/.../questboard/
  const anchors = document.querySelectorAll('a[href*="/questboard/"]');
  return Array.from(anchors).map(anchor => {
    // Get parent quest card text for reward extraction
    let parentText = '';
    let parent = anchor.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      if (parent.className.includes('quest-card') || parent.className.includes('z-0') || parent.tagName === 'DIV') {
        parentText = parent.textContent || '';
        break;
      }
      parent = parent.parentElement;
      depth++;
    }
    return {
      id: anchor.id,
      href: anchor.href,
      innerHTML: anchor.innerHTML,
      innerText: anchor.innerText,
      parentText: parentText,
    };
  });
})()
`;

const EXTRACT_QUEST_CARDS_SCRIPT = `
(() => {
  // Find quest cards as divs that contain anchors with /questboard/ links
  // Using the same selectors as quick-test.ts that successfully found 27 quests
  const cards = document.querySelectorAll(
    'div[class*="quest-card"], div[class*="z-0"], div[class*="quest-card-gradient"], ' +
    'div[data-state], div[type="button"][class*="quest-card"]'
  );
  return Array.from(cards)
    .filter(card => card.querySelector('a[href*="/questboard/"]') !== null)
    .map(card => {
      const anchor = card.querySelector('a[href*="/questboard/"]');
      if (!anchor) return null;
      return {
        id: anchor.id || card.id,
        href: anchor.href,
        innerHTML: anchor.innerHTML,
        innerText: anchor.innerText || card.textContent || '',
        parentText: card.textContent || '',
      };
    })
    .filter(Boolean);
})()
`;

export class ZealyQuestScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: env.SCRAPER_HEADLESS,
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });

    logger.info("Playwright browser initialized with anti-detection");
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info("Playwright browser closed");
  }

  /**
   * Loads a page and reports everything we learn about its structure.
   * Used for debugging when scans come back empty.
   */
  async diagnose(url: string): Promise<PageDiagnostics> {
    await this.initialize();

    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    const page = await this.context.newPage();
    const apiCalls: string[] = [];
    const consoleErrors: string[] = [];

    page.on("response", (response) => {
      const requestUrl = response.url();
      if (/api|graphql|quest/i.test(requestUrl) && !/\.(js|css|png|jpg|svg|woff2?)/i.test(requestUrl)) {
        apiCalls.push(`${response.status()} ${requestUrl}`);
      }
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: env.SCRAPER_TIMEOUT,
      });

      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        // continue
      }

      await this.waitForQuestContent(page);
      await this.scrollToLoadMore(page);

      const diagnostics = await page.evaluate(() => {
        const count = (selector: string) => {
          try {
            return document.querySelectorAll(selector).length;
          } catch {
            return -1;
          }
        };

        // Use type assertion to bypass strict type checking for DOM queries
        const rawAnchors: Array<{
          href: string;
          id: string | null;
          classes: string;
          text: string;
        }> = [];

        const allAnchors = document.querySelectorAll("a");
        for (let i = 0; i < allAnchors.length; i++) {
          const a = allAnchors[i];
          if (a && a.nodeType === 1) { // Node type 1 = ELEMENT_NODE
            rawAnchors.push({
              href: a.href,
              id: a.id,
              classes: a.className,
              text: (a.innerText || "").trim().slice(0, 80),
            });
          }
        }

        const questboardAnchors = rawAnchors.filter(
          (a) => a.href.includes("/questboard/") || a.href.includes("/quest/")
        );

        return {
          title: document.title,
          url: document.location.href,
          bodyTextPreview: (document.body?.innerText || "").slice(0, 1500),
          htmlLength: document.documentElement.outerHTML.length,
          elementCounts: {
            "a[href*=\"/questboard/\"]": count('a[href*="/questboard/"]'),
            "a[id][href*=\"/questboard/\"]": count('a[id][href*="/questboard/"]'),
            "a[href*=\"/quest/\"]": count('a[href*="/quest/"]'),
            "[class*=\"quest\"]": count('[class*="quest"]'),
            "[class*=\"card\"]": count('[class*="card"]'),
            "[class*=\"item\"]": count('[class*="item"]'),
            "[data-testid*=\"quest\"]": count('[data-testid*="quest"]'),
            "h1, h2, h3, h4": count("h1, h2, h3, h4"),
          },
          anchorSample: questboardAnchors.slice(0, 25),
          allAnchorSample: rawAnchors.slice(0, 25),
        };
      });

      return {
        ...diagnostics,
        httpStatus: response?.status() ?? null,
        apiCalls: apiCalls.slice(0, 30),
        consoleErrors: consoleErrors.slice(0, 15),
      };
    } finally {
      await page.close();
    }
  }

  async scanProject(
    url: string,
    projectSlug: string,
    projectName: string,
    previousQuestCount: number = 0
  ): Promise<ScanResult> {
    await this.initialize();

    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    const page = await this.context.newPage();
    const quests: NormalizedQuest[] = [];

    try {
      logger.info({ url, projectSlug }, "Starting scan");

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: env.SCRAPER_TIMEOUT,
      });
      logger.debug({ url, projectSlug }, "Page loaded");

      // Wait for network to settle
      try {
        await page.waitForLoadState("networkidle", { timeout: 20000 });
      } catch {
        logger.warn({ projectSlug }, "Network idle timeout, continuing anyway");
      }

      // Scroll FIRST to trigger lazy loading (this is what quick-test does that works)
      await this.scrollToLoadMore(page);

      // No need to wait for quest content - we just scroll and extract like quick-test

      // Extract anchors using multiple strategies
      let anchorData: AnchorData[] = [];

      // Strategy 1: Direct anchor extraction
      try {
        const result = await page.evaluate(EXTRACT_ANCHORS_SCRIPT);
        anchorData = (result as AnchorData[]) ?? [];
      } catch (evalError) {
        const msg = evalError instanceof Error ? evalError.message : String(evalError);
        logger.warn({ error: msg, projectSlug }, "Strategy 1 failed: direct anchor extraction");
      }

      // Strategy 2: Quest card extraction (if strategy 1 found nothing)
      if (anchorData.length === 0) {
        try {
          const result = await page.evaluate(EXTRACT_QUEST_CARDS_SCRIPT);
          anchorData = (result as AnchorData[]) ?? [];
        } catch (evalError) {
          const msg = evalError instanceof Error ? evalError.message : String(evalError);
          logger.warn({ error: msg, projectSlug }, "Strategy 2 failed: quest card extraction");
        }
      }

      logger.info({ count: anchorData.length, projectSlug }, "Found quest anchors after all strategies");

      if (anchorData.length === 0) {
        logger.warn({ projectSlug, url }, "No quest anchors found - page may have changed structure or blocked");
        const title = await page.title().catch(() => "unknown");
        logger.debug({ title, projectSlug }, "Page title");

        // Dump some page content for debugging
        const bodyText = await page.locator('body').textContent().catch(() => "");
        logger.debug({ bodyText: bodyText?.substring(0, 1000), projectSlug }, "Page body preview");
      }

      for (const data of anchorData) {
        try {
          const quest = this.buildQuestFromData(data, projectSlug, projectName);
          if (quest) {
            quests.push(quest);
          }
        } catch (error) {
          logger.warn({ error }, "Failed to extract quest from anchor");
        }
      }

      const result = this.evaluateScanResult(quests, previousQuestCount);
      logger.info({ projectSlug, ...result }, "Scan completed");
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ error: errorMessage, stack: errorStack, projectSlug }, "Scan failed");
      return {
        quests: [],
        newQuests: [],
        questsFound: 0,
        newQuestsFound: 0,
        status: "failed",
        errorMessage,
      };
    } finally {
      await page.close();
    }
  }

  private async waitForQuestContent(page: Page): Promise<void> {
    // Quick check first - don't wait long if content is already there
    try {
      const hasAnchors = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/questboard/"]').length > 0;
      });
      if (hasAnchors) {
        logger.debug("Questboard anchors already present");
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Continue to wait
    }

    // Wait for SPA hydration with reasonable timeout
    try {
      await page.waitForFunction(() => {
        return document.querySelectorAll('a[href*="/questboard/"]').length > 0;
      }, { timeout: 15000 });

      logger.debug("Found questboard anchors via waitForFunction");
      await page.waitForTimeout(1500);
      return;
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) },
        "Timed out waiting for questboard anchors via function");
    }

    // Fallback to selector-based approach with shorter timeouts
    const selectorsToTry = [
      'a[href*="/questboard/"]',
      'a[href*="/cw/"]',
      '[class*="quest"]',
      '[data-testid*="quest"]',
      '[class*="card"] a[href*="/quest"]',
    ];

    for (const selector of selectorsToTry) {
      try {
        await page.waitForSelector(selector, {
          timeout: 10000,
          state: "attached",
        });
        logger.debug({ selector }, "Found quest content with selector");
        await page.waitForTimeout(1500);
        return;
      } catch {
        // Try next selector
      }
    }

    logger.warn({ projectSlug: "" },
      "Quest anchors not found with any selector, falling back to time-based wait");
    await page.waitForTimeout(3000);
  }

  private async scrollToLoadMore(page: Page): Promise<void> {
    logger.debug("Starting scroll to load more content");

    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 10;

    while (scrollAttempts < maxScrollAttempts) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);

      if (currentHeight === previousHeight) {
        // No new content loaded, try one more scroll
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);

        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === currentHeight) {
          break; // Truly no more content
        }
        previousHeight = newHeight;
      } else {
        previousHeight = currentHeight;
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      scrollAttempts++;
    }

    logger.debug({ scrollAttempts }, "Finished scrolling");
  }

  private buildQuestFromData(
    data: AnchorData,
    projectSlug: string,
    projectName: string
  ): NormalizedQuest | null {
    const mockAnchor = this.createMockAnchor(data);

    if (!isQuestAnchor(mockAnchor)) {
      return null;
    }

    const questId = extractQuestIdFromAnchor(mockAnchor) || this.extractQuestIdFromHref(data.href);
    if (!questId) {
      return null;
    }

    const questName = this.extractQuestNameFromHtml(data.innerHTML, data.innerText);
    const reward = this.extractRewardFromText(data.innerText, data.parentText || "");
    const questUrl = new URL(data.href, "https://zealy.io").href;

    return {
      questId,
      projectSlug,
      projectName,
      questName,
      questUrl,
      reward,
      detectedAt: new Date(),
    };
  }

  private createMockAnchor(data: AnchorData): HTMLAnchorElement {
    return {
      id: data.id,
      href: data.href,
      innerHTML: data.innerHTML,
      innerText: data.innerText,
      textContent: data.innerText,
      tagName: "A",
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as HTMLAnchorElement;
  }

  private extractQuestIdFromHref(href: string): string | null {
    const url = new URL(href, "https://zealy.io");
    const segments = url.pathname.split("/").filter(Boolean);

    // Look for quest-like segments
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg.length > 0 && seg !== "questboard" && seg !== "quests") {
        return seg;
      }
    }

    return segments.at(-1) ?? null;
  }

  private extractQuestNameFromHtml(innerHTML: string, innerText: string): string {
    const strategies = [
      () => this.extractFromVisibleText(innerText),
      () => this.extractFromHeading(innerHTML),
      () => this.extractFromTitleClass(innerHTML),
    ];

    for (const strategy of strategies) {
      const name = strategy();
      if (name && name.trim().length > 0 && name.trim() !== "Unnamed Quest") {
        return this.decodeHtmlEntities(name.trim());
      }
    }

    return "Unnamed Quest";
  }

  private decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}


  private extractFromHeading(html: string): string | null {
    const headingMatch = html.match(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/i);
    if (headingMatch) {
      const text = headingMatch[1].trim();
      if (this.isValidQuestName(text)) {
        return text;
      }
    }
    return null;
  }

  private extractFromTitleClass(html: string): string | null {
    const titleMatch = html.match(/class="[^"]*(?:title|name|quest)[^"]*"[^>]*>([^<]+)</i);
    if (titleMatch) {
      const text = titleMatch[1].trim();
      if (this.isValidQuestName(text)) {
        return text;
      }
    }
    return null;
  }

  private extractFromVisibleText(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed && this.isValidQuestName(trimmed)) {
      return trimmed;
    }
    return null;
  }

  private isValidQuestName(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > 200) return false;

    const lower = trimmed.toLowerCase();
    const invalidPatterns = [
      /^\d+(\.\d+)?\s*(xp|points?)$/i,
      /^(claim|complete|start|open|view)$/i,
      /^(home|dashboard|quests?|categories?|leaderboard)$/i,
      /^(xp|reward|points?)\s*:/i,
    ];

    return !invalidPatterns.some((pattern) => pattern.test(lower));
  }

  private extractRewardFromText(text: string, parentText: string = ""): string | null {
    const combinedText = text + " " + parentText;
    // Try pattern with space: "100 XP" or "100 xp"
    let xpMatch = combinedText.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*xp/i);
    if (xpMatch) {
      return xpMatch[1].replace(/,/g, "") + " XP";
    }
    // Try pattern without space: "Xp100" or "XP100" or "xp100"
    xpMatch = combinedText.match(/xp\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
    if (xpMatch) {
      return xpMatch[1].replace(/,/g, "") + " XP";
    }
    return null;
  }

  private evaluateScanResult(quests: NormalizedQuest[], previousQuestCount: number): ScanResult {
    if (previousQuestCount > 0 && quests.length === 0) {
      return {
        quests,
        newQuests: [],
        questsFound: 0,
        newQuestsFound: 0,
        status: "suspicious",
        errorMessage: "Zero quests found - possible scraping issue or bot detection",
      };
    }

    if (
      previousQuestCount > 0 &&
      quests.length / previousQuestCount < env.MIN_EXPECTED_QUEST_RATIO
    ) {
      return {
        quests,
        newQuests: [],
        questsFound: quests.length,
        newQuestsFound: 0,
        status: "suspicious",
        errorMessage: `Quest count dropped significantly: ${previousQuestCount} -> ${quests.length}`,
      };
    }

    return {
      quests,
      newQuests: [],
      questsFound: quests.length,
      newQuestsFound: 0,
      status: "completed",
    };
  }
}

export async function createScraper(): Promise<ZealyQuestScraper> {
  const scraper = new ZealyQuestScraper();
  await scraper.initialize();
  return scraper;
}