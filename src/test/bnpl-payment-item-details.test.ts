import { describe, expect, it } from "vitest";
import { createAccount, createSpace } from "@/lib/actions";
import { buildSchedule } from "@/lib/bnpl";
import { recordPlatformPayment, createPlan } from "@/lib/bnpl-actions";
import { transactionsCsv } from "@/lib/csv";
import { describeTx, bnplPaymentItems } from "@/lib/labels";
import { LedgerStore, memoryPersistence } from "@/lib/store";

const p = (pesos: number) => pesos * 100;
const date = "2026-11-06";

describe("BNPL payment item descriptions", () => {
  it("shows each linked purchase in Activity, payment details, and CSV exports", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.load();
    const main = await createSpace(store, "Personal", "personal");
    const bank = await createAccount(store, main, "Bank", "bank", 0);
    const category = store.getSnapshot().categories.find((item) => item.data.name === "Food");
    if (!category) throw new Error("Missing test category.");
    const create = async (description: string) =>
      createPlan(store, main, {
        description,
        provider: "Shop",
        purchaseDate: date,
        categoryId: category.id,
        schedule: buildSchedule(date, [p(1000)], () => crypto.randomUUID()),
      });
    const tumbler = await create("Tumbler");
    const microphone = await create("Microphone");
    const snapBeforePayment = store.getSnapshot();
    const tumblerInstallment = snapBeforePayment.loans.find((loan) => loan.id === tumbler)?.data
      .bnpl?.schedule[0];
    const microphoneInstallment = snapBeforePayment.loans.find((loan) => loan.id === microphone)
      ?.data.bnpl?.schedule[0];
    if (!tumblerInstallment || !microphoneInstallment)
      throw new Error("Missing test installments.");

    const groupId = await recordPlatformPayment(store, main, {
      accountId: bank,
      date,
      actualTotal: p(1900),
      allocations: [
        {
          planId: tumbler,
          installmentId: tumblerInstallment.id,
          principal: p(1000),
          fee: 0,
        },
        {
          planId: microphone,
          installmentId: microphoneInstallment.id,
          principal: p(900),
          fee: 0,
        },
      ],
    });
    const snap = store.getSnapshot();
    const payments = snap.transactions.filter(
      (tx) => tx.data.type === "bnpl_payment" && tx.data.payment_group_id === groupId,
    );
    expect(payments).toHaveLength(2);
    expect(payments.map((tx) => describeTx(tx, snap)).sort()).toEqual(["Microphone", "Tumbler"]);
    expect(bnplPaymentItems(payments[0]!, snap)).toEqual([
      { label: "Microphone", provider: "Shop", amount: p(900) },
      { label: "Tumbler", provider: "Shop", amount: p(1000) },
    ]);

    const csv = transactionsCsv(snap, main, date, date);
    const rows = csv.split("\r\n");
    const header = rows[0]?.split(",") ?? [];
    const descriptionIndex = header.indexOf('"item_description"');
    expect(descriptionIndex).toBeGreaterThan(-1);
    const paymentRows = rows.filter((row) => row.includes('"bnpl_payment"'));
    expect(paymentRows).toHaveLength(2);
    expect(paymentRows.map((row) => row.split(",")[descriptionIndex]).sort()).toEqual([
      '"Microphone"',
      '"Tumbler"',
    ]);
  });

  it("keeps legacy single-installment payments identifiable without a payment group", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.load();
    const main = await createSpace(store, "Personal", "personal");
    const bank = await createAccount(store, main, "Bank", "bank", 0);
    const category = store.getSnapshot().categories.find((item) => item.data.name === "Food");
    if (!category) throw new Error("Missing test category.");
    const plan = await createPlan(store, main, {
      description: "Headphones",
      provider: "Store",
      purchaseDate: date,
      categoryId: category.id,
      schedule: buildSchedule(date, [p(500)], () => crypto.randomUUID()),
    });
    const installment = store.getSnapshot().loans.find((loan) => loan.id === plan)?.data.bnpl
      ?.schedule[0];
    if (!installment) throw new Error("Missing test installment.");
    const paymentId = await (async () => {
      const { markInstallmentPaid } = await import("@/lib/bnpl-actions");
      return markInstallmentPaid(store, main, plan, installment.id, {
        accountId: bank,
        date,
        actualPaid: p(500),
      });
    })();
    const snap = store.getSnapshot();
    const payment = snap.transactions.find((tx) => tx.id === paymentId);
    if (!payment) throw new Error("Missing test payment.");
    expect(describeTx(payment, snap)).toBe("Headphones");
    expect(bnplPaymentItems(payment, snap)).toEqual([
      { label: "Headphones", provider: "Store", amount: p(500) },
    ]);
  });
});
