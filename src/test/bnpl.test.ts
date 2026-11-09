import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/types";
import {
  addMonthsClamped,
  BNPL_DURATION_PRESETS,
  BNPL_MAX_MONTHS,
  scheduleDates,
  bnplPaymentEntries,
  bnplPurchaseEntries,
  budgetImpact,
  budgetStatus,
  buildSchedule,
  deterministicId,
  installmentStatus,
  monthCommitment,
  outstandingTotal,
  scheduleTotal,
  splitObligation,
  splitPayment,
  validateSchedule,
  type BnplPlanData,
} from "@/lib/bnpl";

let n = 0;
const id = () => `i${++n}`;
// Mini ledger mirroring selectors.ts: balances, loan outstanding, reported income/expense
const sum = (es: Entry[], f: (e: Entry) => boolean) =>
  es.filter(f).reduce((a, e) => a + e.delta, 0);
const bank = (es: Entry[]) => sum(es, (e) => e.account_id === "bank");
// 0 - x (not -x) so a settled obligation is +0, never -0
const owed = (es: Entry[], loan = "L") => 0 - sum(es, (e) => e.loan_id === loan);
const expenses = (es: Entry[]) =>
  es.filter((e) => e.report === "expense").reduce((a, e) => a + Math.abs(e.delta), 0);
const income = (es: Entry[]) =>
  es.filter((e) => e.report === "income").reduce((a, e) => a + Math.abs(e.delta), 0);

describe("schedule", () => {
  it("clamps to month end but stays anchored to the original day", () => {
    expect(buildSchedule("2026-01-31", [1, 1, 1], id).map((i) => i.due_date)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("duration is editable: presets and any custom whole number up to the max", () => {
    for (const n of BNPL_DURATION_PRESETS) expect(scheduleDates("2026-03-10", n)).toHaveLength(n);
    expect(scheduleDates("2026-03-10", 5)).toHaveLength(5); // custom
    expect(scheduleDates("2026-03-10", BNPL_MAX_MONTHS)).toHaveLength(36);
    expect(scheduleDates("2026-03-10", 12).at(-1)).toBe("2027-02-10");
    expect(() => scheduleDates("2026-03-10", 0)).toThrow();
    expect(() => scheduleDates("2026-03-10", 37)).toThrow();
    expect(() => scheduleDates("2026-03-10", 2.5)).toThrow();
  });
  it("every month's payment is entered exactly; amounts can differ and stay exact", () => {
    const s = buildSchedule("2026-11-10", [33333, 33334, 33333], id); // P333.33, P333.34, P333.33
    expect(s.map((i) => i.amount)).toEqual([33333, 33334, 33333]);
    expect(scheduleTotal(s)).toBe(100000);
  });
  it("never guesses a missing, zero, negative or fractional amount", () => {
    expect(() => buildSchedule("2026-11-10", [100, 0, 100], id)).toThrow(/month 2/);
    expect(() => buildSchedule("2026-11-10", [100, -5], id)).toThrow(/month 2/);
    expect(() => buildSchedule("2026-11-10", [100, 10.5], id)).toThrow(/month 2/);
    expect(() => buildSchedule("2026-11-10", [100, Number.NaN], id)).toThrow(/month 2/);
    expect(() => buildSchedule("2026-11-10", [], id)).toThrow();
  });
  it("rejects bad dates and bad schedules", () => {
    expect(() => buildSchedule("2026-02-30", [100], id)).toThrow();
    expect(
      validateSchedule([
        { id: "a", due_date: "2026-11-10", amount: 1 },
        { id: "a", due_date: "2026-12-10", amount: 1 },
      ]),
    ).toMatch(/unique/);
    expect(validateSchedule([])).toMatch(/1 to 36/);
    expect(
      validateSchedule(
        Array.from({ length: 37 }, (_, k) => ({ id: `x${k}`, due_date: "2026-11-10", amount: 1 })),
      ),
    ).toMatch(/1 to 36/);
  });
});

describe("obligation split", () => {
  it("no purchase total: whole obligation is the purchase", () =>
    expect(splitObligation(300000)).toEqual({ purchase: 300000, fees: 0 }));
  it("purchase total below installments: remainder is fees/interest", () =>
    expect(splitObligation(330000, 300000)).toEqual({ purchase: 300000, fees: 30000 }));
  it("purchase total above installments is rejected", () =>
    expect(() => splitObligation(300000, 330000)).toThrow(/upfront/));
});

describe("accounting: P3,000 purchase in three P1,000 installments", () => {
  it("records the expense once; payments never add a second expense", () => {
    const sch = buildSchedule("2026-12-01", [100000, 100000, 100000], id);
    const { purchase, fees } = splitObligation(scheduleTotal(sch), 300000);
    const ledger: Entry[] = bnplPurchaseEntries({
      loanId: "L",
      purchase,
      fees,
      categoryId: "shopping",
    });
    expect(expenses(ledger)).toBe(300000);
    expect(bank(ledger)).toBe(0); // cash does not move at purchase
    expect(owed(ledger)).toBe(300000);
    for (const i of sch)
      ledger.push(...bnplPaymentEntries({ loanId: "L", accountId: "bank", scheduled: i.amount }));
    expect(bank(ledger)).toBe(-300000); // cash reduced by the payments
    expect(owed(ledger)).toBe(0);
    expect(expenses(ledger)).toBe(300000); // still once
    expect(income(ledger)).toBe(0);
  });
  it("fees/interest are a separate expense and the obligation covers them", () => {
    const sch = buildSchedule("2026-12-01", [110000, 110000, 110000], id);
    const { purchase, fees } = splitObligation(scheduleTotal(sch), 300000);
    const ledger = bnplPurchaseEntries({
      loanId: "L",
      purchase,
      fees,
      categoryId: "shopping",
      feeCategoryId: "bnplfees",
    });
    expect(owed(ledger)).toBe(330000);
    expect(
      ledger.filter((e) => e.category_id === "bnplfees").reduce((a, e) => a + Math.abs(e.delta), 0),
    ).toBe(30000);
    for (const i of sch)
      ledger.push(...bnplPaymentEntries({ loanId: "L", accountId: "bank", scheduled: i.amount }));
    expect(owed(ledger)).toBe(0);
    expect(expenses(ledger)).toBe(330000);
    expect(bank(ledger)).toBe(-330000);
  });
  it("paying more than scheduled: the extra is a fee expense, the obligation falls only by the scheduled amount", () => {
    const ledger = bnplPurchaseEntries({ loanId: "L", purchase: 100000, fees: 0 });
    const { scheduled, extra } = splitPayment(100000, 105000);
    ledger.push(
      ...bnplPaymentEntries({
        loanId: "L",
        accountId: "bank",
        scheduled,
        extra,
        feeCategoryId: "bnplfees",
      }),
    );
    expect(bank(ledger)).toBe(-105000);
    expect(owed(ledger)).toBe(0);
    expect(expenses(ledger)).toBe(105000);
  });
  it("short payments are rejected in this release", () =>
    expect(() => splitPayment(100000, 99999)).toThrow(/Partial/));
  it("partial progress: obligation equals unpaid scheduled amounts", () => {
    const sch = buildSchedule("2026-12-01", [100000, 100000, 100000], id);
    const ledger = bnplPurchaseEntries({ loanId: "L", purchase: 300000, fees: 0 });
    const paid = new Set<string>();
    const first = sch[0];
    if (!first) throw new Error("fixture");
    ledger.push(...bnplPaymentEntries({ loanId: "L", accountId: "bank", scheduled: first.amount }));
    paid.add(first.id);
    expect(owed(ledger)).toBe(outstandingTotal([{ data: { schedule: sch } }], paid));
  });
  it("rejects non-integer money", () => {
    expect(() => bnplPurchaseEntries({ loanId: "L", purchase: 10.5, fees: 0 })).toThrow();
    expect(() => bnplPaymentEntries({ loanId: "L", accountId: "bank", scheduled: 1.5 })).toThrow();
  });
});

describe("idempotent payment id", () => {
  it("is stable per installment, distinct across installments, UUID-shaped", async () => {
    const a = await deterministicId("bnpl-payment", "inst-1");
    expect(await deterministicId("bnpl-payment", "inst-1")).toBe(a);
    expect(await deterministicId("bnpl-payment", "inst-2")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("status, monthly commitment, budget", () => {
  const plan = (
    provider: string,
    first: string,
    months: number,
    amt: number,
    cancelled = false,
  ): { data: BnplPlanData } => ({
    data: {
      months,
      provider,
      schedule: buildSchedule(
        first,
        Array.from({ length: months }, () => amt),
        id,
      ),
      cancelled,
    },
  });
  const a = plan("Shopee", "2026-11-20", 3, 100000);
  const b = plan("TikTok", "2026-11-25", 1, 50000);
  const c = plan("Old", "2026-11-05", 3, 999999, true);
  const none = new Set<string>();

  it("past due without confirmation is 'unconfirmed', never 'overdue'", () => {
    const i = a.data.schedule[0];
    if (!i) throw new Error("fixture");
    expect(installmentStatus(i, none, "2026-11-21")).toBe("past_due_unconfirmed");
    expect(installmentStatus(i, none, "2026-11-20")).toBe("due_today");
    expect(installmentStatus(i, none, "2026-11-19")).toBe("upcoming");
    expect(installmentStatus(i, new Set([i.id]), "2026-12-31")).toBe("paid");
  });
  it("counts unpaid installments due in the month across providers, ignoring cancelled plans", () => {
    expect(monthCommitment([a, b, c], "2026-11", none)).toEqual({ committed: 150000, count: 2 });
    expect(monthCommitment([a, b, c], "2026-12", none)).toEqual({ committed: 100000, count: 1 });
  });
  it("paid installments stop counting; outstanding total is separate", () => {
    const first = a.data.schedule[0];
    if (!first) throw new Error("fixture");
    const paid = new Set([first.id]);
    expect(monthCommitment([a, b], "2026-11", paid).committed).toBe(50000);
    expect(outstandingTotal([a, b], none)).toBe(350000);
    expect(outstandingTotal([a, b], paid)).toBe(250000);
  });
  it("budget status and advisory preview flag over-budget months only", () => {
    expect(budgetStatus(200000, 150000)).toEqual({
      limit: 200000,
      committed: 150000,
      remaining: 50000,
      pct: 75,
      over: false,
    });
    expect(budgetStatus(100000, 150000).over).toBe(true);
    const extra = buildSchedule("2026-11-28", [80000, 80000, 80000], id);
    const impact = budgetImpact([a, b], extra, 200000, none);
    expect(impact.map((m) => [m.month, m.committed, m.over])).toEqual([
      ["2026-11", 230000, true],
      ["2026-12", 180000, false],
      ["2027-01", 180000, false],
    ]);
    expect(budgetStatus(0, 1000).over).toBe(false); // no budget set: no warning
  });
});
