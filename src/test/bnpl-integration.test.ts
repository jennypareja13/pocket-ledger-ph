import { describe, expect, it } from "vitest";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { buildEntries, validateTx } from "@/lib/ledger";
import { validateRecord } from "@/lib/validate-record";
import {
  accountBalance,
  bnplOwed,
  bnplPaidIds,
  bnplPlans,
  ordinaryLoans,
  periodTotals,
  spaceCash,
  spaceReceivable,
} from "@/lib/selectors";
import { buildSchedule, deterministicId, scheduleTotal, type BnplPlanData } from "@/lib/bnpl";
import type { LoanData, TxData } from "@/lib/types";

const uid = () => crypto.randomUUID();
async function setup() {
  const store = new LedgerStore(memoryPersistence());
  const main = await store.save("space", null, { name: "Main", type: "personal" }, uid());
  const bank = await store.save("account", main.id, { name: "Bank", type: "bank" }, uid());
  await store.save("transaction", main.id, {
    type: "income",
    date: "2026-11-01",
    amount: 1000000,
    account_id: bank.id,
    entries: [{ account_id: bank.id, delta: 1000000 }],
  });
  const shop = await store.save("category", main.id, { name: "Shopping", type: "expense" }, uid());
  const fees = await store.save(
    "category",
    main.id,
    { name: "BNPL fees & interest", type: "expense" },
    uid(),
  );
  return { store, main, bank, shop, fees };
}
function ctx(store: LedgerStore, spaceId: string) {
  const s = store.getSnapshot();
  return { spaceId, accounts: s.accounts, categories: s.categories, loans: s.loans };
}

describe("BNPL through the real store, ledger and selectors", () => {
  it("P3,000 purchase + 3 manual payments (different amounts): expense once, cash only moves on payment, obligation clears", async () => {
    const { store, main, bank, shop, fees } = await setup();
    const planId = uid();
    const schedule = buildSchedule("2026-12-05", [100000, 105000, 100000], uid); // P1,000 / P1,050 / P1,000 = P3,050, purchase P3,000 => P50 fees
    const total = scheduleTotal(schedule);
    const plan: BnplPlanData = {
      months: 3,
      provider: "SPayLater",
      purchase_total: 300000,
      schedule,
    };
    const loan: LoanData = {
      module: "bnpl",
      label: "Phone case",
      borrower_id: "",
      account_id: "",
      principal: total,
      date: "2026-11-05",
      bnpl: plan,
    };
    expect(
      validateRecord(
        {
          id: planId,
          kind: "loan",
          space_id: main.id,
          data: loan,
          deleted: false,
          created_at: "2026-11-05T00:00:00Z",
          updated_at: "2026-11-05T00:00:00Z",
        },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(true);
    await store.apply([{ kind: "loan", id: planId, space_id: main.id, data: loan }]);

    const purchase = {
      type: "bnpl_purchase" as const,
      date: "2026-11-05",
      amount: total,
      fee: total - 300000,
      account_id: "",
      loan_id: planId,
      category_id: shop.id,
      fee_category_id: fees.id,
    };
    expect(validateTx(purchase, ctx(store, main.id))).toBeNull();
    const ptx: TxData = { ...purchase, entries: buildEntries(purchase) };
    expect(
      validateRecord(
        {
          id: uid(),
          kind: "transaction",
          space_id: main.id,
          data: ptx,
          deleted: false,
          created_at: "2026-11-05T00:00:00Z",
          updated_at: "2026-11-05T00:00:00Z",
        },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(true);
    await store.save("transaction", main.id, ptx);

    let s = store.getSnapshot();
    expect(spaceCash(main.id, s.accounts, s.transactions)).toBe(1000000); // cash unchanged by the purchase
    expect(bnplOwed(planId, s.transactions)).toBe(305000);
    expect(periodTotals(main.id, s.transactions, "2026-11").expense).toBe(305000); // 3,000 purchase + 50 fees, recorded once
    expect(spaceReceivable(main.id, s.loans, s.transactions)).toBe(0); // not a receivable
    expect(ordinaryLoans(s.loans)).toHaveLength(0);
    expect(bnplPlans(main.id, s.spaces, s.loans)).toHaveLength(1);

    for (const inst of schedule) {
      const id = await deterministicId("bnpl-payment", inst.id);
      const pay = {
        type: "bnpl_payment" as const,
        date: inst.due_date,
        amount: inst.amount,
        account_id: bank.id,
        loan_id: planId,
        installment_id: inst.id,
      };
      expect(validateTx(pay, ctx(store, main.id))).toBeNull();
      await store.save("transaction", main.id, { ...pay, entries: buildEntries(pay) }, id);
      await store.save("transaction", main.id, { ...pay, entries: buildEntries(pay) }, id); // second device / double tap: same id
    }
    s = store.getSnapshot();
    expect(s.transactions.filter((t) => t.data.type === "bnpl_payment")).toHaveLength(3); // no duplicates
    expect(bnplOwed(planId, s.transactions)).toBe(0);
    expect(accountBalance(bank.id, s.transactions)).toBe(1000000 - 305000);
    expect(periodTotals(main.id, s.transactions, "2026-12").expense).toBe(0); // payments are never expenses
    expect(bnplPaidIds(s.transactions).size).toBe(3);
  });

  it("deleting a payment makes the installment unpaid again; re-paying revives the SAME record", async () => {
    const { store, main, bank, shop } = await setup();
    const planId = uid();
    const schedule = buildSchedule("2026-12-05", [100000], uid);
    const total = scheduleTotal(schedule);
    await store.apply([
      {
        kind: "loan",
        id: planId,
        space_id: main.id,
        data: {
          module: "bnpl",
          borrower_id: "",
          account_id: "",
          principal: total,
          date: "2026-11-05",
          bnpl: { months: 1, provider: "X", schedule },
        } satisfies LoanData,
      },
    ]);
    const purchase = {
      type: "bnpl_purchase" as const,
      date: "2026-11-05",
      amount: total,
      account_id: "",
      loan_id: planId,
      category_id: shop.id,
    };
    await store.save("transaction", main.id, { ...purchase, entries: buildEntries(purchase) });
    const inst = schedule[0];
    if (!inst) throw new Error("fixture");
    const id = await deterministicId("bnpl-payment", inst.id);
    const pay = {
      type: "bnpl_payment" as const,
      date: "2026-12-05",
      amount: inst.amount,
      account_id: bank.id,
      loan_id: planId,
      installment_id: inst.id,
    };
    await store.save("transaction", main.id, { ...pay, entries: buildEntries(pay) }, id);
    await store.remove([id]);
    expect(bnplPaidIds(store.getSnapshot().transactions).size).toBe(0);
    expect(bnplOwed(planId, store.getSnapshot().transactions)).toBe(100000);
    await store.save("transaction", main.id, { ...pay, entries: buildEntries(pay) }, id);
    expect(store.all().filter((r) => r.id === id)).toHaveLength(1);
    expect(bnplOwed(planId, store.getSnapshot().transactions)).toBe(0);
  });

  it("rejects investment-typed records (removed feature) instead of applying them", () => {
    const base = {
      id: uid(),
      space_id: "x",
      deleted: false,
      created_at: "2026-11-05T00:00:00Z",
      updated_at: "2026-11-05T00:00:00Z",
    };
    expect(
      validateRecord(
        {
          ...base,
          kind: "transaction",
          data: {
            type: "investment_funding",
            date: "2026-11-05",
            amount: 100,
            account_id: "a",
            entries: [{ account_id: "a", delta: -100 }],
          },
        },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
    expect(
      validateRecord(
        {
          ...base,
          kind: "loan",
          data: {
            module: "investment",
            borrower_id: "",
            account_id: "a",
            principal: 0,
            date: "2026-11-05",
          },
        },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
  });

  it("validator rejects malformed BNPL plans", () => {
    const base = {
      id: uid(),
      kind: "loan",
      space_id: "x",
      deleted: false,
      created_at: "2026-11-05T00:00:00Z",
      updated_at: "2026-11-05T00:00:00Z",
    };
    const loan = (bnpl: unknown) => ({
      ...base,
      data: {
        module: "bnpl",
        borrower_id: "",
        account_id: "",
        principal: 100,
        date: "2026-11-05",
        bnpl,
      },
    });
    const ok = {
      months: 1,
      provider: "X",
      schedule: [{ id: "i1", due_date: "2026-12-05", amount: 100 }],
    };
    expect(validateRecord(loan(ok), { idPolicy: "uuid" }).ok).toBe(true);
    expect(validateRecord(loan({ ...ok, months: 2 }), { idPolicy: "uuid" }).ok).toBe(false); // months != schedule length
    expect(validateRecord(loan({ ...ok, provider: "" }), { idPolicy: "uuid" }).ok).toBe(false);
    expect(
      validateRecord(
        loan({ ...ok, schedule: [{ id: "i1", due_date: "2026-02-31", amount: 100 }] }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
    expect(validateRecord(loan(undefined), { idPolicy: "uuid" }).ok).toBe(false);
    expect(
      validateRecord(
        loan({
          ...ok,
          months: 37,
          schedule: Array.from({ length: 37 }, (_, k) => ({
            id: `i${k}`,
            due_date: "2026-12-05",
            amount: 1,
          })),
        }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
  });
});
