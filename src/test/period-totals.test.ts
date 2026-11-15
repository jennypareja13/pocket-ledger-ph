import { describe, expect, it } from "vitest";
import { periodTotalsBetween } from "@/lib/period-totals";
import type { Tx } from "@/lib/types";

const at = "2026-11-12T00:00:00.000Z";

function transaction(
  id: string,
  spaceId: string,
  date: string,
  entries: Tx["data"]["entries"],
  deleted = false,
): Tx {
  return {
    id,
    kind: "transaction",
    space_id: spaceId,
    data: {
      type: "expense",
      date,
      amount: 1000,
      account_id: "account",
      entries,
    },
    deleted,
    created_at: at,
    updated_at: at,
    _meta: { sync: "pending", rev: 0, mutation_id: id },
  };
}

describe("periodTotalsBetween", () => {
  it("aggregates inclusive reportable entries for one space", () => {
    const txs = [
      transaction("income", "main", "2026-11-01", [
        { delta: 5000, report: "income", category_id: "salary" },
      ]),
      transaction("expense", "main", "2026-11-30", [
        { delta: -1200, report: "expense", category_id: "food" },
      ]),
      transaction("outside", "main", "2026-12-01", [
        { delta: -700, report: "expense", category_id: "food" },
      ]),
      transaction("foreign", "other", "2026-11-10", [
        { delta: -900, report: "expense", category_id: "food" },
      ]),
      transaction(
        "deleted",
        "main",
        "2026-11-10",
        [{ delta: -800, report: "expense", category_id: "food" }],
        true,
      ),
      transaction("transfer", "main", "2026-11-10", [{ delta: -300 }]),
    ];

    const totals = periodTotalsBetween("main", txs, "2026-11-01", "2026-11-30");
    expect(totals.income).toBe(5000);
    expect(totals.expense).toBe(1200);
    expect(totals.net).toBe(3800);
    expect([...totals.byCategory]).toEqual([
      ["salary", { type: "income", total: 5000 }],
      ["food", { type: "expense", total: 1200 }],
    ]);
  });

  it("rejects invalid and reversed ranges", () => {
    const txs: Tx[] = [];
    expect(() => periodTotalsBetween("main", txs, "2026-02-30", "2026-03-01")).toThrow(
      "valid date range",
    );
    expect(() => periodTotalsBetween("main", txs, "2026-03-02", "2026-03-01")).toThrow(
      "valid date range",
    );
  });
});
