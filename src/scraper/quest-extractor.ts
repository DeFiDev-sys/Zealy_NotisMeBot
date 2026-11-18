import { NormalizedQuest } from "../types";
import { extractQuestIdFromAnchor, isQuestAnchor } from "./selectors";

export function normalizeQuestUrl(href: string, baseUrl: string = "https://zealy.io"): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

export function extractQuestIdFromHref(href: string): string | null {
  const url = new URL(href, "https://zealy.io");
  const segments = url.pathname.split("/").filter(Boolean);

  // Skip trailing "questboard" or "quests" segments from the end
  let i = segments.length - 1;
  while (i >= 0 && (segments[i] === "questboard" || segments[i] === "quests")) {
    i--;
  }

  return i >= 0 ? segments[i] : null;
}

export function extractQuestNameFromHtml(innerHTML: string, innerText: string): string {
  const strategies = [
    () => extractFromHeading(innerHTML),
    () => extractFromTitleClass(innerHTML),
    () => extractFromVisibleText(innerText),
  ];

  for (const strategy of strategies) {
    const name = strategy();
    if (name && name.trim().length > 0 && name.trim() !== "Unnamed Quest") {
      return name.trim();
    }
  }

  return "Unnamed Quest";
}

function extractFromHeading(html: string): string | null {
  const headingMatch = html.match(/<h[1-4][^>]*>([^<]+)<\/h[1-4]>/i);
  if (headingMatch) {
    const text = headingMatch[1].trim();
    if (isValidQuestName(text)) {
      return text;
    }
  }
  return null;
}

function extractFromTitleClass(html: string): string | null {
  const titleMatch = html.match(/class="[^"]*(?:title|name|quest)[^"]*"[^>]*>([^<]+)</i);
  if (titleMatch) {
    const text = titleMatch[1].trim();
    if (isValidQuestName(text)) {
      return text;
    }
  }
  return null;
}

function extractFromVisibleText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed && isValidQuestName(trimmed)) {
    return trimmed;
  }
  return null;
}

function isValidQuestName(text: string): boolean {
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

export function extractRewardFromText(text: string): string | null {
  const xpMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*xp/i);
  if (xpMatch) {
    return xpMatch[1].replace(/,/g, "") + " XP";
  }
  return null;
}

export function buildNormalizedQuest(
  anchor: HTMLAnchorElement,
  projectSlug: string,
  projectName: string
): NormalizedQuest | null {
  if (!isQuestAnchor(anchor)) {
    return null;
  }

  const questId = extractQuestIdFromAnchor(anchor);
  if (!questId) {
    return null;
  }

  const questUrl = normalizeQuestUrl(anchor.href);
  const questName = extractQuestNameFromHtml(anchor.innerHTML, anchor.innerText);
  const reward = extractRewardFromText(anchor.innerText);

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