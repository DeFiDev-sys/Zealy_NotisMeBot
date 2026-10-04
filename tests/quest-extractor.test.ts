import { describe, it, expect } from "vitest";
import {
  normalizeQuestUrl,
  extractQuestNameFromHtml,
  extractRewardFromText,
  extractQuestIdFromHref,
  buildNormalizedQuest,
} from "../src/scraper/quest-extractor";

describe("normalizeQuestUrl", () => {
  it("normalizes relative URLs", () => {
    const result = normalizeQuestUrl("/cw/minebit/questboard/cat/quest123");
    expect(result).toBe("https://zealy.io/cw/minebit/questboard/cat/quest123");
  });

  it("keeps absolute URLs", () => {
    const result = normalizeQuestUrl("https://zealy.io/cw/minebit/questboard/cat/quest123");
    expect(result).toBe("https://zealy.io/cw/minebit/questboard/cat/quest123");
  });
});

describe("extractQuestIdFromHref", () => {
  it("extracts quest ID from href", () => {
    const result = extractQuestIdFromHref("https://zealy.io/cw/minebit/questboard/cat/quest-123");
    expect(result).toBe("quest-123");
  });

  it("returns null for empty href", () => {
    const result = extractQuestIdFromHref("");
    expect(result).toBeNull();
  });
});

describe("extractQuestNameFromHtml", () => {
  it("extracts from heading", () => {
    const result = extractQuestNameFromHtml("<h3>Follow on Twitter</h3>", "Follow on Twitter");
    expect(result).toBe("Follow on Twitter");
  });

  it("extracts from title class", () => {
    const result = extractQuestNameFromHtml(
      '<span class="quest-title">Join Discord</span>',
      "Join Discord"
    );
    expect(result).toBe("Join Discord");
  });

  it("filters out XP text", () => {
    const result = extractQuestNameFromHtml("100 XP", "100 XP");
    expect(result).toBe("Unnamed Quest");
  });

  it("filters out button text", () => {
    const result = extractQuestNameFromHtml("Claim", "Claim");
    expect(result).toBe("Unnamed Quest");
  });

  it("returns Unnamed Quest for empty", () => {
    const result = extractQuestNameFromHtml("", "");
    expect(result).toBe("Unnamed Quest");
  });
});

describe("extractRewardFromText", () => {
  it("extracts XP reward", () => {
    const result = extractRewardFromText("Reward: 500 XP");
    expect(result).toBe("500 XP");
  });

  it("extracts XP with comma", () => {
    const result = extractRewardFromText("1,500 XP");
    expect(result).toBe("1500 XP");
  });

  it("returns null for no reward", () => {
    const result = extractRewardFromText("No reward here");
    expect(result).toBeNull();
  });
});

describe("buildNormalizedQuest", () => {
  it("builds quest from anchor with id", () => {
    const anchor = {
      id: "quest-123",
      href: "https://zealy.io/cw/minebit/questboard/cat/quest-123",
      innerHTML: "<h3>Follow on Twitter</h3>",
      innerText: "Follow on Twitter",
      textContent: "Follow on Twitter",
      tagName: "A",
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as HTMLAnchorElement;

    const result = buildNormalizedQuest(anchor, "minebit", "Minebit");

    expect(result).not.toBeNull();
    expect(result?.questId).toBe("quest-123");
    expect(result?.questName).toBe("Follow on Twitter");
    expect(result?.questUrl).toBe("https://zealy.io/cw/minebit/questboard/cat/quest-123");
    expect(result?.projectSlug).toBe("minebit");
    expect(result?.projectName).toBe("Minebit");
  });

  it("falls back to href segment when no id", () => {
    const anchor = {
      id: "",
      href: "https://zealy.io/cw/minebit/questboard/cat/quest-456",
      innerHTML: "<h3>Join Discord</h3>",
      innerText: "Join Discord",
      textContent: "Join Discord",
      tagName: "A",
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as HTMLAnchorElement;

    const result = buildNormalizedQuest(anchor, "minebit", "Minebit");

    expect(result).not.toBeNull();
    expect(result?.questId).toBe("quest-456");
  });

  it("returns null for non-quest anchor", () => {
    const anchor = {
      id: "",
      href: "https://zealy.io/cw/minebit/dashboard",
      innerHTML: "Dashboard",
      innerText: "Dashboard",
      textContent: "Dashboard",
      tagName: "A",
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as HTMLAnchorElement;

    const result = buildNormalizedQuest(anchor, "minebit", "Minebit");
    expect(result).toBeNull();
  });
});