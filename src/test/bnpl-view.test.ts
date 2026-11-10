import { describe, expect, it } from "vitest";
import { evenSplit } from "@/lib/bnpl-view";

describe("evenSplit", () => {
  it("puts leftover centavos in the last installment", () => {
    expect(evenSplit(56500, 3)).toEqual([18833, 18833, 18834]);
  });

  it("puts multiple leftover centavos in the last installments", () => {
    expect(evenSplit(100, 4)).toEqual([25, 25, 25, 25]);
    expect(evenSplit(102, 4)).toEqual([25, 25, 26, 26]);
  });

  it("preserves the exact total and handles invalid inputs", () => {
    expect(evenSplit(10000, 4).reduce((sum, amount) => sum + amount, 0)).toBe(10000);
    expect(evenSplit(100, 0)).toEqual([]);
    expect(evenSplit(10.5, 2)).toEqual([]);
  });
});
