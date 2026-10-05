import { chromium, Browser, Page, BrowserContext } from "playwright";
import { NormalizedQuest, ScanResult } from "../types";
import { buildNormalizedQuest } from "./quest-extractor";
import { isQuestAnchor } from "./selectors";
import { createLogger } from "../utils/logger";
import { env } from "../config/env";

const logger = createLogger("zealy-scraper");

interface AnchorData {
  id: string;
  href: string;
  innerHTML: string;
  innerText: string;
}

const EXTRACT_ANCHORS_SCRIPT = `
() => {
  const anchors = document.querySelectorAll('a[id][href*="/questboard/"]');
  return Array.from(anchors).map(anchor => ({
    id: anchor.id,
    href: anchor.href,
    innerHTML: anchor.innerHTML,
    innerText: anchor.innerText,
  }));
}
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
    });

    logger.info("Playwright browser initialized");
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
      logger.debug({ url, projectSlug }, "Page loaded, waiting for quest content");

      // Wait longer for network to settle and content to render
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
      } catch {
        logger.warn({ projectSlug }, "Network idle timeout, continuing anyway");
      }

      await this.waitForQuestContent(page);

      let anchorData: AnchorData[] = [];
      try {
        const result = await page.evaluate(EXTRACT_ANCHORS_SCRIPT);
        anchorData = (result as AnchorData[]) ?? [];
      } catch (evalError) {
        const msg = evalError instanceof Error ? evalError.message : String(evalError);
        logger.error({ error: msg, projectSlug }, "Failed to evaluate anchor extraction script");
        const title = await page.title().catch(() => "unknown");
        logger.debug({ title, projectSlug }, "Page title after eval error");
      }
      
      logger.info({ count: anchorData.length, projectSlug }, "Found quest anchors");
      
      if (anchorData.length === 0) {
        logger.warn({ projectSlug, url }, "No quest anchors found - page may have changed structure or blocked");
        const title = await page.title().catch(() => "unknown");
        logger.debug({ title, projectSlug }, "Page title");
        
        // Dump some page content for debugging
        const bodyText = await page.locator('body').textContent().catch(() => "");
        logger.debug({ bodyText: bodyText?.substring(0, 500), projectSlug }, "Page body preview");
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
    try {
      await page.waitForSelector(SELECTORS.questAnchor, {
        timeout: 10000,
        state: "attached",
      });
      await page.waitForTimeout(1000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: msg, projectSlug: "" }, "Quest anchors not found within timeout, continuing anyway");
    }
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

    const questId = data.id || this.extractQuestIdFromHref(data.href);
    if (!questId) {
      return null;
    }

    const questName = this.extractQuestNameFromHtml(data.innerHTML, data.innerText);
    const reward = this.extractRewardFromText(data.innerText);
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
    const segments = href.split("/").filter(Boolean);
    return segments.at(-1) ?? null;
  }

  private extractQuestNameFromHtml(innerHTML: string, innerText: string): string {
    const strategies = [
      () => this.extractFromHeading(innerHTML),
      () => this.extractFromTitleClass(innerHTML),
      () => this.extractFromVisibleText(innerText),
    ];

    for (const strategy of strategies) {
      const name = strategy();
      if (name && name.trim().length > 0 && name.trim() !== "Unnamed Quest") {
        return name.trim();
      }
    }

    return "Unnamed Quest";
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

  private extractRewardFromText(text: string): string | null {
    const xpMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*xp/i);
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
        errorMessage: "Zero quests found - possible scraping issue",
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

const SELECTORS = {
  questAnchor: 'a[id][href*="/questboard/"]',
} as const;

export async function createScraper(): Promise<ZealyQuestScraper> {
  const scraper = new ZealyQuestScraper();
  await scraper.initialize();
  return scraper;
}