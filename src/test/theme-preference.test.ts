import { describe, expect, it } from "vitest";

import { parseThemePreference, resolveTheme } from "@/components/app/ThemeProvider";

describe("theme preference", () => {
  it("defaults missing or invalid saved preferences to light", () => {
    expect(parseThemePreference(null)).toBe("light");
    expect(parseThemePreference("garbage")).toBe("light");
  });

  it("preserves valid saved preferences", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
  });

  it("uses the selected light or dark theme regardless of system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference when system is selected", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
