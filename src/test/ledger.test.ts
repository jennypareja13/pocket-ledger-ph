import { describe, expect, it } from "vitest";
import { buildEntries } from "@/lib/ledger";

const sum = (e: ReturnType<typeof buildEntries>, f: (x: (typeof e)[number]) => boolean) =>
  e.filter(f).reduce((s, x) => s + x.delta, 0);

describe("ledger entries", () => {
  it("transfer ₱1,000 with ₱15 fee: source -1,015, dest +1,000, only ₱15 is expense", () => {
    const e = buildEntries({ type: "transfer", date: "2026-10-01", amount: 100000, fee: 1500, account_id: "a", to_account_id: "b", fee_category_id: "fee" });
    expect(sum(e, (x) => x.account_id === "a")).toBe(-101500);
    expect(sum(e, (x) => x.account_id === "b")).toBe(100000);
    expect(sum(e, (x) => x.report === "expense")).toBe(-1500);
    expect(e.some((x) => x.report === "income")).toBe(false);
  });
  it("lending ₱2,000 is not an expense; repayment ₱500 is not income", () => {
    const lend = buildEntries({ type: "lend", date: "2026-10-01", amount: 200000, account_id: "a", loan_id: "l" });
    const pay = buildEntries({ type: "loan_repayment", date: "2026-10-02", amount: 50000, account_id: "a", loan_id: "l" });
    const all = [...lend, ...pay];
    expect(all.some((x) => x.report)).toBe(false);
    expect(sum(all, (x) => x.loan_id === "l")).toBe(150000);
    expect(sum(all, (x) => x.account_id === "a")).toBe(-150000);
  });
});
