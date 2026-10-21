// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/styles/theme.css", import.meta.url)), "utf8");

/** The colour tokens of the rule whose selector names this theme. */
function theme(name: "dark" | "light"): Record<string, string> {
  const rule = new RegExp(`[^{}]*\\[data-theme="${name}"\\][^{}]*\\{([^}]*)\\}`).exec(css);
  if (!rule) throw new Error(`theme.css has no ${name} theme`);
  return Object.fromEntries([...rule[1]!.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

/** WCAG 2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const TEXT = ["--text", "--muted", "--accent", "--success", "--danger", "--warning"];
const SURFACES = ["--bg", "--surface", "--raised"];

describe.each(["dark", "light"] as const)("the %s theme (spec 11.2, 11.6)", (name) => {
  const tokens = theme(name);

  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface] as const)))("%s on %s reaches WCAG AA (4.5:1)", (text, surface) => {
    expect(contrast(tokens[text]!, tokens[surface]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("puts --accent-ink on --accent at 4.5:1 or more", () => {
    expect(contrast(tokens["--accent-ink"]!, tokens["--accent"]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("token values", () => {
  it("are exactly those of spec 11.2", () => {
    expect(theme("dark")).toEqual({
      "--bg": "#111315",
      "--surface": "#292c2d",
      "--raised": "#3d4142",
      "--text": "#ffffff",
      "--muted": "#adb0b2",
      "--accent": "#93c5fd",
      "--accent-ink": "#111315",
      "--success": "#50cd89",
      "--danger": "#ff8a8a",
      "--warning": "#f5c451",
    });
    expect(theme("light")).toEqual({
      "--bg": "#f4f5f7",
      "--surface": "#ffffff",
      "--raised": "#eef0f3",
      "--text": "#111315",
      "--muted": "#5b6066",
      "--accent": "#2563eb",
      "--accent-ink": "#ffffff",
      "--success": "#147a3a",
      "--danger": "#b91c1c",
      "--warning": "#8a5206",
    });
  });
});
