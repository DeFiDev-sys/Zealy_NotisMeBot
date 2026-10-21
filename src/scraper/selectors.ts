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
  return (
    anchor.tagName === "A" &&
    (anchor.href.includes("/questboard/") || anchor.href.includes("/quest/"))
  );
}

export function extractQuestIdFromAnchor(anchor: HTMLAnchorElement): string | null {
  if (anchor.id && anchor.id.length > 0) {
    return anchor.id;
  }

  const href = new URL(anchor.href, "https://zealy.io").href;
  const segments = href.split("/").filter(Boolean);

  // Try to extract from URL path segments
  const possibleIds = segments.slice(-2);
  for (const seg of possibleIds) {
    if (seg.length > 0 && seg !== "questboard") {
      return seg;
    }
  }

  return null;
}