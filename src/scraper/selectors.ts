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

  const url = new URL(anchor.href, "https://zealy.io");
  const segments = url.pathname.split("/").filter(Boolean);

  // Look for quest-like segments from the end
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg.length > 0 && seg !== "questboard" && seg !== "quests") {
      return seg;
    }
  }

  return null;
}