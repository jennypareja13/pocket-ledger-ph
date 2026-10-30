import { describe, expect, it } from "vitest";
import { createAccount, createLoan, createSpace, saveTransaction } from "@/lib/actions";
import { accountBalance, loanOutstanding, periodTotals, spaceCash } from "@/lib/selectors";
import { LedgerStore, memoryPersistence, type Persistence } from "@/lib/store";
import { syncOnce, type PushResult, type Remote, type RemoteRow } from "@/lib/sync-engine";
import type { LocalRecord } from "@/lib/types";

const P = (pesos: number) => pesos * 100;
const DATE = "2026-10-15";
const MONTH = "2026-10";

async function setup(p: Persistence = memoryPersistence()) {
  const store = new LedgerStore(p);
  await store.load();
  const space = await createSpace(store, "Personal", "personal");
  const bank = await createAccount(store, space, "Bank", "bank", P(5000));
  const cash = await createAccount(store, space, "Cash", "cash", P(5000));
  return { store, space, bank, cash, snap: () => store.getSnapshot() };
}
const cat = (s: ReturnType<LedgerStore["getSnapshot"]>, space: string, pred: (n: string, sys?: string) => boolean) =>
  s.categories.find((c) => c.space_id === space && pred(c.data.name, c.data.system))!.id;

describe("acceptance: transfer with fee", () => {
  it("₱5,000 bank → transfer ₱1,000 with ₱15 fee leaves ₱3,985 and adds exactly ₱15 expense", async () => {
    const { store, space, bank, cash, snap } = await setup();
    await saveTransaction(store, snap(), space, {
      type: "transfer", date: DATE, amount: P(1000), fee: P(15), account_id: bank, to_account_id: cash,
      fee_category_id: cat(snap(), space, (_, sys) => sys === "fee"),
    });
    const s = snap();
    expect(accountBalance(bank, s.transactions)).toBe(P(3985));
    expect(accountBalance(cash, s.transactions)).toBe(P(6000));
    const t = periodTotals(space, s.transactions, MONTH);
    expect(t.expense).toBe(P(15));
    expect(t.income).toBe(0);
  });
});

describe("acceptance: lending", () => {
  it("lend ₱2,000 then repayment ₱500 leaves ₱1,500 owed with no income/expense", async () => {
    const { store, space, cash, snap } = await setup();
    const [b] = await store.apply([{ kind: "borrower", space_id: space, data: { name: "Ana" } }]);
    const loanId = await createLoan(store, snap(), space, { borrower_id: b!.id, account_id: cash, principal: P(2000), date: DATE });
    let s = snap();
    expect(accountBalance(cash, s.transactions)).toBe(P(3000));
    expect(loanOutstanding(loanId, s.transactions)).toBe(P(2000));
    expect(periodTotals(space, s.transactions, MONTH).expense).toBe(0);

    await saveTransaction(store, s, space, { type: "loan_repayment", date: DATE, amount: P(500), account_id: cash, loan_id: loanId });
    s = snap();
    expect(accountBalance(cash, s.transactions)).toBe(P(3500));
    expect(loanOutstanding(loanId, s.transactions)).toBe(P(1500));
    const t = periodTotals(space, s.transactions, MONTH);
    expect(t.income).toBe(0);
    expect(t.expense).toBe(0);
  });

  it("rejects a repayment larger than what is owed", async () => {
    const { store, space, cash, snap } = await setup();
    const [b] = await store.apply([{ kind: "borrower", space_id: space, data: { name: "Ben" } }]);
    const loanId = await createLoan(store, snap(), space, { borrower_id: b!.id, account_id: cash, principal: P(100), date: DATE });
    await expect(
      saveTransaction(store, snap(), space, { type: "loan_repayment", date: DATE, amount: P(101), account_id: cash, loan_id: loanId }),
    ).rejects.toThrow();
  });
});

describe("acceptance: managed space isolation", () => {
  it("managed fund balances and transactions stay out of personal totals", async () => {
    const { store, space, snap } = await setup();
    const fund = await createSpace(store, "Sinking fund", "managed");
    const fundAcc = await createAccount(store, fund, "Fund bank", "bank", P(20000));
    await saveTransaction(store, snap(), fund, {
      type: "income", date: DATE, amount: P(3000), account_id: fundAcc,
      category_id: cat(snap(), fund, (n) => n === "Contributions"),
    });
    const s = snap();
    expect(spaceCash(space, s.accounts, s.transactions)).toBe(P(10000));
    expect(periodTotals(space, s.transactions, MONTH).income).toBe(0);
    expect(spaceCash(fund, s.accounts, s.transactions)).toBe(P(23000));
  });

  it("rejects using another space's account", async () => {
    const { store, space, snap } = await setup();
    const fund = await createSpace(store, "Fund", "managed");
    const fundAcc = await createAccount(store, fund, "Fund bank", "bank", 0);
    await expect(
      saveTransaction(store, snap(), space, {
        type: "expense", date: DATE, amount: P(10), account_id: fundAcc,
        category_id: cat(snap(), space, (n) => n === "Food"),
      }),
    ).rejects.toThrow();
  });
});

/** Fake server mirroring push_record: idempotent on mutation id, optimistic rev check. */
function fakeRemote(opts: { failNext?: boolean; loseResponse?: boolean } = {}) {
  const rows = new Map<string, RemoteRow>();
  let tick = 0;
  const remote: Remote = {
    async push(r: LocalRecord): Promise<PushResult> {
      if (opts.failNext) { opts.failNext = false; throw new Error("offline"); }
      const ex = rows.get(r.id);
      const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
      let res: PushResult;
      if (!ex) {
        rows.set(r.id, { id: r.id, kind: r.kind, space_id: r.space_id, data: r.data, deleted: r.deleted, rev: 1,
          last_mutation_id: r._meta.mutation_id, created_at: ts, updated_at: ts });
        res = { status: "ok", rev: 1 };
      } else if (ex.last_mutation_id === r._meta.mutation_id) res = { status: "ok", rev: ex.rev };
      else if (ex.rev !== r._meta.rev) res = { status: "conflict", rev: ex.rev, data: ex.data, deleted: ex.deleted };
      else {
        rows.set(r.id, { ...ex, data: r.data, deleted: r.deleted, rev: ex.rev + 1, last_mutation_id: r._meta.mutation_id, updated_at: ts });
        res = { status: "ok", rev: ex.rev + 1 };
      }
      if (opts.loseResponse) { opts.loseResponse = false; throw new Error("response lost"); }
      return res;
    },
    async pull(since) {
      return [...rows.values()].filter((r) => !since || r.updated_at >= since).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    },
  };
  return { remote, rows };
}

describe("acceptance: offline durability and idempotent sync", () => {
  it("an offline transaction survives reload, shows pending, and is not duplicated on retry", async () => {
    const p = memoryPersistence();
    const { store, space, cash, snap } = await setup(p);
    const tx = await saveTransaction(store, snap(), space, {
      type: "expense", date: DATE, amount: P(120), account_id: cash, category_id: cat(snap(), space, (n) => n === "Food"),
    });
    expect(snap().pending).toBeGreaterThan(0);

    // Reload from durable storage (simulates closing the app while offline).
    const reloaded = new LedgerStore(p);
    await reloaded.load();
    expect(reloaded.get(tx.id)?._meta.sync).toBe("pending");

    // First attempt: server stores it but the response is lost.
    const { remote, rows } = fakeRemote({ loseResponse: true });
    const r1 = await syncOnce(reloaded, remote);
    expect(r1.error).toBeDefined();
    expect(reloaded.get(tx.id)?._meta.sync).toBe("error");

    // Retry: same mutation id → server returns ok without duplicating.
    const r2 = await syncOnce(reloaded, remote);
    expect(r2.error).toBeUndefined();
    expect(reloaded.getSnapshot().pending).toBe(0);
    expect([...rows.values()].filter((r) => r.id === tx.id)).toHaveLength(1);
    expect(rows.get(tx.id)?.rev).toBe(1);
    const txCount = reloaded.getSnapshot().transactions.filter((t) => t.data.amount === P(120)).length;
    expect(txCount).toBe(1);

    // Further syncs are no-ops.
    const before = rows.size;
    await syncOnce(reloaded, remote);
    expect(rows.size).toBe(before);
  });
});
