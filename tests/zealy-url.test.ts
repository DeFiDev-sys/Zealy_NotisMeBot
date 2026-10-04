import { describe, it, expect } from "vitest";
import { parseZealyUrl, isValidZealyUrl } from "../src/utils/zealy-url";

describe("parseZealyUrl", () => {
  it("parses standard Zealy URL", () => {
    const result = parseZealyUrl("https://zealy.io/cw/minebit/questboard/");
    expect(result).toEqual({
      url: "https://zealy.io/cw/minebit/questboard/",
      projectSlug: "minebit",
      projectName: "Minebit",
    });
  });

  it("parses URL without trailing slash", () => {
    const result = parseZealyUrl("https://zealy.io/cw/minebit/questboard");
    expect(result).toEqual({
      url: "https://zealy.io/cw/minebit/questboard",
      projectSlug: "minebit",
      projectName: "Minebit",
    });
  });

  it("parses www subdomain", () => {
    const result = parseZealyUrl("https://www.zealy.io/cw/project-two/questboard/");
    expect(result).toEqual({
      url: "https://www.zealy.io/cw/project-two/questboard/",
      projectSlug: "project-two",
      projectName: "Project Two",
    });
  });

  it("parses URL with multiple dashes", () => {
    const result = parseZealyUrl("https://zealy.io/cw/my-awesome-project/questboard/");
    expect(result).toEqual({
      url: "https://zealy.io/cw/my-awesome-project/questboard/",
      projectSlug: "my-awesome-project",
      projectName: "My Awesome Project",
    });
  });

  it("returns null for invalid URL", () => {
    const result = parseZealyUrl("https://google.com");
    expect(result).toBeNull();
  });

  it("returns null for non-questboard Zealy URL", () => {
    const result = parseZealyUrl("https://zealy.io/cw/minebit/dashboard");
    expect(result).toBeNull();
  });

  it("returns null for malformed URL", () => {
    const result = parseZealyUrl("not-a-url");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseZealyUrl("");
    expect(result).toBeNull();
  });

  it("trims whitespace", () => {
    const result = parseZealyUrl("  https://zealy.io/cw/minebit/questboard/  ");
    expect(result).not.toBeNull();
    expect(result?.projectSlug).toBe("minebit");
  });
});

describe("isValidZealyUrl", () => {
  it("returns true for valid URL", () => {
    expect(isValidZealyUrl("https://zealy.io/cw/minebit/questboard/")).toBe(true);
  });

  it("returns false for invalid URL", () => {
    expect(isValidZealyUrl("https://google.com")).toBe(false);
  });
});