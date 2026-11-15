import { describe, expect, it } from "vitest";
import { periodDateRange, shiftPeriodAnchor } from "@/lib/dates";

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

  it.each(["2026-02-30", "2026-13-01", "not-a-date"])("rejects invalid anchor %s", (anchor) => {
    expect(() => periodDateRange("week", anchor)).toThrow("valid date");
  });
  it("navigates day and week periods across calendar boundaries", () => {
    expect(shiftPeriodAnchor("day", "2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftPeriodAnchor("week", "2026-11-01", 1)).toBe("2026-11-08");
    expect(shiftPeriodAnchor("week", "2026-11-02", -1)).toBe("2026-10-26");
  });

  it("navigates month and year periods using calendar starts", () => {
    expect(shiftPeriodAnchor("month", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftPeriodAnchor("month", "2028-02-29", 1)).toBe("2028-03-01");
    expect(shiftPeriodAnchor("year", "2026-12-31", 1)).toBe("2027-01-01");
  });
});
