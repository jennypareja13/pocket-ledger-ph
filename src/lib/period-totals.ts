import type { Tx } from "./types";
import type { PeriodTotals } from "./selectors";

/** Aggregate reportable income and expense entries in an inclusive date range. */
export function periodTotalsBetween(spaceId: string, txs: Tx[], from: string, to: string): PeriodTotals {
  const result: PeriodTotals = { income: 0, expense: 0, net: 0, byCategory: new Map() };
  for (const tx of txs) {
    if (tx.deleted || tx.space_id !== spaceId || tx.data.date < from || tx.data.date > to) continue;
    for (const entry of tx.data.entries) {
      if (!entry.report) continue;
      const amount = Math.abs(entry.delta);
      if (entry.report === "income") result.income += amount;
      else result.expense += amount;
      const key = entry.category_id ?? "uncategorized";
      const current = result.byCategory.get(key) ?? { type: entry.report, total: 0 };
      current.total += amount;
      result.byCategory.set(key, current);
    }
  }
  result.net = result.income - result.expense;
  return result;
}
