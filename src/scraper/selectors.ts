export const SELECTORS = {
  questAnchor: 'a[href*="/questboard/"]',
  questCard: '[class*="quest"], [class*="card"], [class*="item"], [data-testid*="quest"], [data-testid*="card"]',
  questName: {
    heading: "h1, h2, h3, h4",
    titleClass: '[class*="title"], [class*="name"], [class*="quest"]',
  },
};

export function isQuestAnchor(element: Element): boolean {
  const anchor = element as HTMLAnchorElement;
  if (anchor.tagName !== "A") return false;

  const href = anchor.href;

  // Must be a questboard or quest URL
  if (!(href.includes("/questboard/") || href.includes("/quest/"))) {
    return false;
  }

  // Filter out navigation/tab links:
  // - /cw/{slug}/questboard/ (root questboard page)
  // - /cw/{slug}/questboard/sprints (sprints tab)
  // - /cw/{slug}/questboard/{sprintId}/ (sprint page - but this may contain quests)
  const url = new URL(href, "https://zealy.io");
  const segments = url.pathname.split("/").filter(Boolean);

  // Root questboard or sprints tab - not a quest
  if (segments.length <= 2) return false; // e.g., ["cw", "lynxcap", "questboard"] or ["cw", "lynxcap", "questboard", "sprints"]

  // Quest links have at least 4 segments: /cw/{slug}/questboard/{sprintId}/{questId}
  // Or /quest/{questId}
  if (href.includes("/quest/")) {
    return segments.length >= 2; // /quest/{id}
  }

  // /questboard/ links need at least 5 segments: /cw/{slug}/questboard/{sprintId}/{questId}
  return segments.length >= 5;
}

export function extractQuestIdFromAnchor(anchor: HTMLAnchorElement): string | null {
  // Priority 1: Use anchor.id if it's a valid UUID or long string
  if (anchor.id && anchor.id.length > 0 && anchor.id.length > 5) {
    return anchor.id;
  }

  const url = new URL(anchor.href, "https://zealy.io");
  const segments = url.pathname.split("/").filter(Boolean);

  // Look for quest-like segments from the end
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // Skip known non-quest segments
    if (seg === "questboard" || seg === "quests" || seg === "cw") continue;

    // Zealy quest IDs are typically UUIDs (long) but can be shorter like "quest-456"
    // Accept segments that are either:
    // - Long (UUID-like, > 10 chars)
    // - Or contain "quest" prefix
    if (seg.length > 10 || seg.startsWith("quest-") || seg.includes("-")) {
      return seg;
    }
  }

  return null;
}