import { describe, expect, it } from "vitest";
import {
  bnplEnabled,
  createPlan,
  deletePlan,
  markInstallmentPaid,
  setBnplBudget,
  toggleBnpl,
  updateInstallmentDueDate,
  type CreatePlanInput,
} from "@/lib/bnpl-actions";
import { buildSchedule } from "@/lib/bnpl";
import { createAccount, createSpace } from "@/lib/actions";
import { transactionsCsv } from "@/lib/csv";
import { isValidDate } from "@/lib/dates";
import { buildEntries, validateTx } from "@/lib/ledger";
import { txTypeLabel } from "@/lib/labels";
import { restoreBackup } from "@/lib/restore";
import {
  accountBalance,
  bnplOwed,
  bnplPlans,
  expenseBreakdown,
  monthlyTrend,
  ordinaryLoans,
  periodTotals,
  spaceReceivable,
} from "@/lib/selectors";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { syncOnce, type Remote, type RemoteRow } from "@/lib/sync-engine";
import type { SpaceData } from "@/lib/types";
import { validateRecord } from "@/lib/validate-record";

const p = (pesos: number) => pesos * 100;
const date = "2026-11-06";
async function setup() {
  const store = new LedgerStore(memoryPersistence());
  await store.load();
  const main = await createSpace(store, "Personal", "personal");
  const bank = await createAccount(store, main, "Bank", "bank", 0);
  const category = store.getSnapshot().categories.find((c) => c.data.name === "Food");
  if (!category) throw new Error("Missing test category.");
  const input = (amounts = [p(1000), p(1000), p(1000)]): CreatePlanInput => ({
    description: "Appliance",
    provider: "Store",
    purchaseDate: date,
    categoryId: category.id,
    schedule: buildSchedule("2026-11-30", amounts, () => crypto.randomUUID()),
    note: "Reviewed",
  });
  const pay = (plan: string, installment: string, actualPaid = p(1000)) =>
    markInstallmentPaid(store, main, plan, installment, { accountId: bank, date, actualPaid });
  return { store, main, bank, input, pay };
}

describe("BNPL actions", () => {
  it("records three manually entered payments as expense once without cash or ordinary receivables", async () => {
    const { store, main, bank, input } = await setup();
    const id = await createPlan(store, main, input());
    const snap = store.getSnapshot();
    expect(periodTotals(main, snap.transactions, "2026-11").expense).toBe(p(3000));
    expect(accountBalance(bank, snap.transactions)).toBe(0);
    expect(bnplOwed(id, snap.transactions)).toBe(p(3000));
    expect(spaceReceivable(main, snap.loans, snap.transactions)).toBe(0);
    expect(ordinaryLoans(snap.loans)).toEqual([]);
    const purchase = snap.transactions.find((tx) => tx.data.type === "bnpl_purchase");
    if (!purchase) throw new Error("Missing purchase.");
    expect(purchase.data.account_id).toBe("");
    expect(purchase.data.installment_id).toBeUndefined();
    expect(purchase.data.entries.every((entry) => entry.account_id === undefined)).toBe(true);
    expect(
      validateTx(purchase.data, {
        spaceId: main,
        accounts: [],
        categories: snap.categories,
        loans: snap.loans,
      }),
    ).toBeNull();
    expect(validateRecord(purchase, { idPolicy: "uuid" }).ok).toBe(true);
    expect(expenseBreakdown(main, snap.transactions, "2026-11")[0]?.total).toBe(p(3000));
    expect(monthlyTrend(main, snap.transactions, "2026-11", 1)[0]?.expense).toBe(p(3000));
  });

  it("stores unequal amounts exactly, without filling or spreading amounts", async () => {
    const { store, main, input } = await setup();
    const reviewed = input([p(1000), p(1050), p(950)]);
    const id = await createPlan(store, main, reviewed);
    expect(store.getSnapshot().loans.find((loan) => loan.id === id)?.data.bnpl?.schedule).toEqual(
      reviewed.schedule,
    );
    reviewed.schedule[0] = { id: "changed", due_date: date, amount: 1 };
    expect(
      store.getSnapshot().loans.find((loan) => loan.id === id)?.data.bnpl?.schedule[0]?.amount,
    ).toBe(p(1000));
  });

  it.each([5, 24])("accepts a custom duration of %i", async (months) => {
    const { store, main, input } = await setup();
    const id = await createPlan(store, main, input(Array.from({ length: months }, () => p(1000))));
    expect(store.getSnapshot().loans.find((loan) => loan.id === id)?.data.bnpl?.months).toBe(
      months,
    );
  });

  it("rejects 37 installments without any write", async () => {
    const { store, main, input } = await setup();
    const before = structuredClone(store.all());
    const base = input();
    const schedule = Array.from({ length: 37 }, () => ({
      id: crypto.randomUUID(),
      due_date: date,
      amount: p(1000),
    }));
    await expect(createPlan(store, main, { ...base, schedule })).rejects.toThrow("1 to 36");
    expect(store.all()).toEqual(before);
  });

  it("splits purchase and fees and three repayments clear obligation without another expense", async () => {
    const { store, main, bank, input, pay } = await setup();
    const reviewed = { ...input([p(1100), p(1100), p(1100)]), purchaseTotal: p(3000) };
    const id = await createPlan(store, main, reviewed);
    const fee = store
      .getSnapshot()
      .categories.find((category) => category.data.name === "BNPL fees & interest");
    if (!fee) throw new Error("Missing fee category.");
    const totals = periodTotals(main, store.getSnapshot().transactions, "2026-11");
    expect(totals.byCategory.get(reviewed.categoryId)?.total).toBe(p(3000));
    expect(totals.byCategory.get(fee.id)?.total).toBe(p(300));
    expect(bnplOwed(id, store.getSnapshot().transactions)).toBe(p(3300));
    for (const installment of reviewed.schedule) await pay(id, installment.id, p(1100));
    const snap = store.getSnapshot();
    expect(accountBalance(bank, snap.transactions)).toBe(-p(3300));
    expect(bnplOwed(id, snap.transactions)).toBe(0);
    expect(periodTotals(main, snap.transactions, "2026-11")).toMatchObject({
      expense: p(3300),
      income: 0,
    });
    expect(
      snap.categories.filter((category) => category.data.name === "BNPL fees & interest"),
    ).toHaveLength(1);
  });

  it("rejects repeat payments and uses one identity across devices", async () => {
    const { store, main, bank, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const plan = await createPlan(store, main, reviewed);
    const other = new LedgerStore(memoryPersistence());
    await other.putRaw(structuredClone(store.all()));
    const id = await pay(plan, first.id);
    const before = structuredClone(store.all());
    await expect(pay(plan, first.id)).rejects.toThrow("already paid");
    expect(store.all()).toEqual(before);
    const otherId = await markInstallmentPaid(other, main, plan, first.id, {
      accountId: bank,
      date,
      actualPaid: p(1000),
    });
    expect(otherId).toBe(id);
    const remoteRecord = other.get(otherId);
    if (!remoteRecord) throw new Error("Missing second device payment.");
    await store.putRaw([remoteRecord]);
    expect(
      store.getSnapshot().transactions.filter((tx) => tx.data.installment_id === first.id),
    ).toHaveLength(1);
    expect(accountBalance(bank, store.getSnapshot().transactions)).toBe(-p(1000));
  });

  it("records an extra 50 as expense and rejects short payments without writes", async () => {
    const { store, main, bank, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const id = await createPlan(store, main, reviewed);
    const before = structuredClone(store.all());
    await expect(pay(id, first.id, p(999))).rejects.toThrow("Partial payments");
    expect(store.all()).toEqual(before);
    await pay(id, first.id, p(1050));
    const snap = store.getSnapshot();
    expect(periodTotals(main, snap.transactions, "2026-11").expense).toBe(p(3050));
    expect(accountBalance(bank, snap.transactions)).toBe(-p(1050));
    expect(bnplOwed(id, snap.transactions)).toBe(p(2000));
    const fee = snap.categories.find((category) => category.data.name === "BNPL fees & interest");
    expect(
      periodTotals(main, snap.transactions, "2026-11").byCategory.get(fee?.id ?? "")?.total,
    ).toBe(p(50));
  });

  it("deletes plan and purchase atomically only before payments", async () => {
    const { store, main, bank, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const id = await createPlan(store, main, reviewed);
    await pay(id, first.id);
    const before = structuredClone(store.all());
    await expect(deletePlan(store, id)).rejects.toThrow("with payments");
    expect(store.all()).toEqual(before);
    const clean = await setup();
    const cleanId = await createPlan(clean.store, clean.main, clean.input());
    await deletePlan(clean.store, cleanId);
    const snap = clean.store.getSnapshot();
    expect(snap.loans).toEqual([]);
    expect(bnplOwed(cleanId, snap.transactions)).toBe(0);
    expect(periodTotals(clean.main, snap.transactions, "2026-11").expense).toBe(0);
    expect(accountBalance(clean.bank, snap.transactions)).toBe(0);
    expect(clean.store.all().filter((record) => record.deleted)).toHaveLength(2);
    expect(accountBalance(bank, store.getSnapshot().transactions)).toBe(-p(1000));
  });

  it("changes only an unpaid due date and revives the same deleted payment ID", async () => {
    const { store, main, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const id = await createPlan(store, main, reviewed);
    const previous = structuredClone(store.getSnapshot().loans[0]?.data);
    if (!previous?.bnpl) throw new Error("Missing plan.");
    await updateInstallmentDueDate(store, id, first.id, "2026-12-01");
    expect(store.getSnapshot().loans[0]?.data).toEqual({
      ...previous,
      bnpl: {
        ...previous.bnpl,
        schedule: previous.bnpl.schedule.map((item) =>
          item.id === first.id ? { ...item, due_date: "2026-12-01" } : item,
        ),
      },
    });
    const payment = await pay(id, first.id);
    const createdAt = store.get(payment)?.created_at;
    const before = structuredClone(store.all());
    await expect(updateInstallmentDueDate(store, id, first.id, date)).rejects.toThrow(
      "Paid installment",
    );
    expect(store.all()).toEqual(before);
    await store.remove([payment]);
    expect(await pay(id, first.id)).toBe(payment);
    expect(store.get(payment)?.deleted).toBe(false);
    expect(store.get(payment)?.created_at).toBe(createdAt);
    expect(
      store.getSnapshot().transactions.filter((tx) => tx.data.installment_id === first.id),
    ).toHaveLength(1);
  });

  it("preserves Main fields and validates toggles and budgets", async () => {
    const { store, main, input } = await setup();
    const data: SpaceData = {
      name: "Main",
      type: "personal",
      note: "Keep",
      bnpl_budget: p(5000),
    };
    await store.save("space", main, data, main);
    expect(bnplEnabled(store.getSnapshot(), main)).toBe(true);
    await toggleBnpl(store, main, false);
    expect(store.getSnapshot().spaces[0]?.data).toEqual({
      ...data,
      modules: { bnpl: false },
    });
    const before = structuredClone(store.all());
    await expect(createPlan(store, main, input())).rejects.toThrow("Enable BNPL");
    expect(store.all()).toEqual(before);
    await toggleBnpl(store, main, true);
    await setBnplBudget(store, main, 0);
    expect(store.getSnapshot().spaces[0]?.data.bnpl_budget).toBe(0);
    const saved = structuredClone(store.all());
    await expect(setBnplBudget(store, main, -1)).rejects.toThrow("non-negative");
    await expect(setBnplBudget(store, main, 1.5)).rejects.toThrow("non-negative");
    expect(store.all()).toEqual(saved);
    await setBnplBudget(store, main, null);
    expect(store.getSnapshot().spaces[0]?.data.bnpl_budget).toBeUndefined();
    expect(store.getSnapshot().spaces[0]?.data.note).toBe("Keep");
  });

  it("does not allow managed spaces to store a BNPL budget", async () => {
    const { store, main } = await setup();
    const managed = await createSpace(store, "Managed", "managed", main);
    const before = structuredClone(store.all());
    await expect(setBnplBudget(store, managed, p(5000))).rejects.toThrow("Main Space");
    expect(store.all()).toEqual(before);
  });

  it("validates BNPL backups, rejects malformed plans and quarantines malformed pulls", async () => {
    const { store, main, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const id = await createPlan(store, main, reviewed);
    await pay(id, first.id);
    const plan = store.getSnapshot().loans.find((loan) => loan.id === id);
    if (!plan?.data.bnpl) throw new Error("Missing plan.");
    for (const record of store.all())
      expect(validateRecord(record, { idPolicy: "uuid" }).ok).toBe(true);
    for (const patch of [
      { months: 4 },
      { provider: "" },
      { provider: 123 },
      { schedule: [{ ...first, amount: -1 }] },
    ]) {
      expect(
        validateRecord(
          { ...plan, data: { ...plan.data, bnpl: { ...plan.data.bnpl, ...patch } } },
          { idPolicy: "uuid" },
        ).ok,
      ).toBe(false);
    }
    expect(
      validateRecord(
        { ...plan, data: { ...plan.data, module: "investment" } },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
    const payment = store.getSnapshot().transactions.find((tx) => tx.data.type === "bnpl_payment");
    if (!payment) throw new Error("Missing payment.");
    expect(
      validateRecord(
        { ...payment, data: { ...payment.data, type: "investment_fund" } },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
    const restored = new LedgerStore(memoryPersistence());
    const records = store.all().map(({ _meta: omitted, ...record }) => {
      void omitted;
      return record;
    });
    expect(
      await restoreBackup(
        restored,
        JSON.parse(JSON.stringify({ version: 1, records })),
        "uuid",
        () => true,
      ),
    ).toBe(records.length);
    expect(bnplOwed(id, restored.getSnapshot().transactions)).toBe(p(2000));
    const row: RemoteRow = {
      ...plan,
      data: { ...plan.data, bnpl: { ...plan.data.bnpl, months: 37 } },
      rev: 1,
      last_mutation_id: crypto.randomUUID(),
    };
    const remote: Remote = {
      push: async () => ({ status: "ok", rev: 1 }),
      pull: async () => [row],
    };
    const pulled = new LedgerStore(memoryPersistence());
    expect((await syncOnce(pulled, remote)).pullOk).toBe(true);
    expect(pulled.get(id)).toBeUndefined();
    expect((await pulled.getQuarantine()).items[0]).toMatchObject({ id, source: "pull" });
  });

  it("exports both BNPL types with an empty purchase account and correct payment account", async () => {
    const { store, main, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const id = await createPlan(store, main, reviewed);
    await pay(id, first.id);
    const csv = transactionsCsv(store.getSnapshot(), main, date, date);
    const purchase = csv.split("\r\n").find((line) => line.includes('"bnpl_purchase"'));
    const payment = csv.split("\r\n").find((line) => line.includes('"bnpl_payment"'));
    expect(purchase?.split(",")[6]).toBe('""');
    expect(payment?.split(",")[6]).toBe('"Bank"');
    expect(txTypeLabel("bnpl_purchase")).toBe("BNPL purchase");
    expect(txTypeLabel("bnpl_payment")).toBe("BNPL payment");
  });

  it("never lists plans for managed selections", async () => {
    const { store, main, input } = await setup();
    await createPlan(store, main, input());
    const managed = await createSpace(store, "Managed", "managed", main);
    const snap = store.getSnapshot();
    expect(bnplPlans(main, snap.spaces, snap.loans)).toHaveLength(1);
    expect(bnplPlans(managed, snap.spaces, snap.loans)).toEqual([]);
    await expect(createPlan(store, managed, input())).rejects.toThrow("Main Space");
  });

  it("rejects invalid dates, missing installments, and foreign or archived accounts without writes", async () => {
    const { store, main, bank, input, pay } = await setup();
    const reviewed = input();
    const first = reviewed.schedule[0];
    if (!first) throw new Error("Missing installment.");
    const beforePurchase = structuredClone(store.all());
    await expect(
      createPlan(store, main, { ...reviewed, purchaseDate: "2026-02-30" }),
    ).rejects.toThrow("purchase date");
    expect(store.all()).toEqual(beforePurchase);
    const id = await createPlan(store, main, reviewed);
    const foreign = await createSpace(store, "Other", "personal");
    const otherBank = await createAccount(store, foreign, "Other bank", "bank", 0);
    const before = structuredClone(store.all());
    await expect(
      markInstallmentPaid(store, main, id, first.id, {
        accountId: bank,
        date: "2026-04-31",
        actualPaid: p(1000),
      }),
    ).rejects.toThrow("payment date");
    await expect(
      markInstallmentPaid(store, main, id, first.id, {
        accountId: otherBank,
        date,
        actualPaid: p(1000),
      }),
    ).rejects.toThrow("active account");
    await expect(pay(id, "missing")).rejects.toThrow("not found");
    await expect(updateInstallmentDueDate(store, id, first.id, "2026-02-31")).rejects.toThrow(
      "valid due date",
    );
    expect(store.all()).toEqual(before);
    await store.save("account", main, { name: "Bank", type: "bank", archived: true }, bank);
    const archived = structuredClone(store.all());
    await expect(pay(id, first.id)).rejects.toThrow("active account");
    expect(store.all()).toEqual(archived);
  });
});

describe("strict calendar dates", () => {
  it.each([
    "2026-02-30",
    "2026-02-31",
    "2026-04-31",
    "2026-13-01",
    "2026-02-29",
    "2026-00-01",
    "2026-01-00",
    "1900-02-29",
  ])("rejects %s", (value) => {
    expect(isValidDate(value)).toBe(false);
    const tx = { type: "adjustment" as const, amount: 100, account_id: "bank", date: value };
    expect(validateTx(tx, { spaceId: "main", accounts: [], categories: [], loans: [] })).toBe(
      "Choose a valid date.",
    );
    const at = "2026-11-06T00:00:00Z";
    expect(
      validateRecord(
        {
          id: crypto.randomUUID(),
          kind: "transaction",
          space_id: "main",
          deleted: false,
          created_at: at,
          updated_at: at,
          data: { ...tx, entries: buildEntries(tx) },
        },
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
  });
  it.each(["2028-02-29", "2026-02-28", "2026-12-31", "2000-02-29", "0099-01-01"])(
    "accepts %s",
    (value) => {
      expect(isValidDate(value)).toBe(true);
    },
  );
});
