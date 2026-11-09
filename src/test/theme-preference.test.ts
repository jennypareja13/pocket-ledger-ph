import { describe, expect, it } from "vitest";

import { resolveTheme } from "@/components/app/ThemeProvider";

describe("theme preference", () => {
  it("uses the selected light or dark theme regardless of system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference when system is selected", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
