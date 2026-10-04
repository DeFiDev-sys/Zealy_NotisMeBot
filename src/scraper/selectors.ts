export const SELECTORS = {
  questAnchor: 'a[id][href*="/questboard/"]',
  questName: {
    heading: "h1, h2, h3, h4",
    titleClass: '[class*="title"], [class*="name"], [class*="quest"]',
  },
  questCard: '[class*="quest"], [class*="card"], [class*="item"]',
} as const;

export function isQuestAnchor(element: Element): boolean {
  const anchor = element as HTMLAnchorElement;
  return (
    anchor.tagName === "A" &&
    anchor.href.includes("/questboard/")
  );
}

export function extractQuestIdFromAnchor(anchor: HTMLAnchorElement): string | null {
  if (anchor.id && anchor.id.length > 0) {
    return anchor.id;
  }

  const href = anchor.href;
  const segments = href.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);

  if (lastSegment && lastSegment.length > 0) {
    return lastSegment;
  }

  return null;
}