import { ParsedZealyUrl } from "../types/index.js";

const ZEALY_URL_PATTERN = /^https?:\/\/(?:www\.)?zealy\.io\/cw\/([a-zA-Z0-9\-]+)\/questboard\/?$/i;

export function parseZealyUrl(url: string): ParsedZealyUrl | null {
  const trimmedUrl = url.trim();
  const match = trimmedUrl.match(ZEALY_URL_PATTERN);

  if (!match) {
    return null;
  }

  const projectSlug = match[1].toLowerCase();
  const projectName = formatProjectName(projectSlug);

  return {
    url: trimmedUrl,
    projectSlug,
    projectName,
  };
}

function formatProjectName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isValidZealyUrl(url: string): boolean {
  return parseZealyUrl(url) !== null;
}