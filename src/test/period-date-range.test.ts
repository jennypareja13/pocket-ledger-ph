import { describe, expect, it } from "vitest";
import { periodDateRange } from "@/lib/dates";

describe("periodDateRange", () => {
  it("returns the selected day as a one-day range", () => {
    expect(periodDateRange("day", "2026-11-12")).toEqual({
      from: "2026-11-12",
      to: "2026-11-12",
    });
  });

  it("uses Monday through Sunday for week ranges across month boundaries", () => {
    expect(periodDateRange("week", "2026-11-01")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(periodDateRange("week", "2026-11-02")).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });

  it("returns full calendar months including leap February", () => {
    expect(periodDateRange("month", "2028-02-10")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(periodDateRange("month", "2026-11-30")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("returns the full calendar year", () => {
    expect(periodDateRange("year", "2028-06-15")).toEqual({
      from: "2028-01-01",
      to: "2028-12-31",
    });
  });

  it.each(["2026-02-30", "2026-13-01", "not-a-date"])(
    "rejects invalid anchor %s",
    (anchor) => {
      expect(() => periodDateRange("week", anchor)).toThrow("valid date");
    },
  );
});
