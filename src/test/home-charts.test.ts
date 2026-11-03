import { describe, expect, it } from "vitest";
import { expenseBreakdown, monthlyTrend } from "@/lib/selectors";
import type { Tx } from "@/lib/types";

type Entry = { account_id?: string; loan_id?: string; delta: number; report?: "income" | "expense"; category_id?: string };

function tx(space: string, date: string, entries: Entry[], deleted = false): Tx {
  const shape = { id: crypto.randomUUID(), space_id: space, deleted, data: { date, entries } };
  return shape as unknown as Tx;
}

const A = "space-a";
const B = "space-b";
const txs: Tx[] = [
  tx(A, "2026-11-02", [{ account_id: "c", delta: 500000, report: "income", category_id: "sal" }]),
  tx(A, "2026-11-03", [{ account_id: "c", delta: -20000, report: "expense", category_id: "food" }]),
  tx(A, "2026-11-04", [{ account_id: "c", delta: -5000, report: "expense" }]),
  // transfer ₱1,000 with ₱15 fee
  tx(A, "2026-11-05", [
    { account_id: "bank", delta: -100000 },
    { account_id: "cash", delta: 100000 },
    { account_id: "bank", delta: -1500, report: "expense", category_id: "fee" },
  ]),
  // lend ₱2,000 and repay ₱500
  tx(A, "2026-11-06", [{ account_id: "c", delta: -200000 }, { loan_id: "l", delta: 200000 }]),
  tx(A, "2026-11-07", [{ account_id: "c", delta: 50000 }, { loan_id: "l", delta: -50000 }]),
  tx(A, "2026-11-08", [{ account_id: "c", delta: -99999, report: "expense", category_id: "food" }], true),
  tx(A, "2026-06-30", [{ account_id: "c", delta: -7000, report: "expense", category_id: "food" }]),
  tx(A, "2026-05-31", [{ account_id: "c", delta: -9000, report: "expense", category_id: "food" }]),
  tx(B, "2026-11-03", [{ account_id: "m", delta: -888800, report: "expense", category_id: "food" }]),
];

describe("Home charts", () => {
  it("six-month trend counts only report entries in the selected space", () => {
    const t = monthlyTrend(A, txs, "2026-11");
    expect(t.map((r) => r.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(t[5]).toEqual({ month: "2026-11", income: 500000, expense: 26500 });
    expect(t[0]?.expense).toBe(7000);
  });

  it("category breakdown keeps fee once, uncategorized, and excludes other spaces/deleted", () => {
    expect(expenseBreakdown(A, txs, "2026-11")).toEqual([
      { categoryId: "food", total: 20000 },
      { categoryId: "uncategorized", total: 5000 },
      { categoryId: "fee", total: 1500 },
    ]);
    expect(expenseBreakdown(B, txs, "2026-11")).toEqual([{ categoryId: "food", total: 888800 }]);
    expect(expenseBreakdown(A, txs, "2026-10")).toEqual([]);
  });
});
