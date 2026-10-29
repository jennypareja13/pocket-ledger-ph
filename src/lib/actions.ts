import { buildEntries, validateTx } from "./ledger";
import { loanOutstanding } from "./selectors";
import type { Change, LedgerStore, Snapshot } from "./store";
import type {
  AccountData, AccountType, BudgetData, CategoryData, LoanData, SpaceData, SpaceType, TxData, Tx,
} from "./types";
import { todayManila } from "./dates";

const DEFAULT_CATEGORIES: Record<SpaceType, { income: string[]; expense: string[] }> = {
  personal: {
    income: ["Salary", "Business", "Gifts", "Other income"],
    expense: ["Food", "Transport", "Bills & utilities", "Shopping", "Health", "Other expenses"],
  },
  managed: {
    income: ["Contributions", "Interest", "Other income"],
    expense: ["Disbursements", "Other expenses"],
  },
};

export async function createSpace(store: LedgerStore, name: string, type: SpaceType) {
  const id = crypto.randomUUID();
  const d = DEFAULT_CATEGORIES[type];
  const cat = (n: string, t: "income" | "expense", system?: "fee"): Change => ({
    kind: "category", space_id: id, data: { name: n, type: t, ...(system ? { system } : {}) } satisfies CategoryData,
  });
  await store.apply([
    { kind: "space", id, space_id: id, data: { name: name.trim(), type } satisfies SpaceData },
    ...d.income.map((n) => cat(n, "income")),
    ...d.expense.map((n) => cat(n, "expense")),
    cat("Bank & transfer fees", "expense", "fee"),
  ]);
  return id;
}

export async function createAccount(
  store: LedgerStore, spaceId: string, name: string, type: AccountType, opening: number,
) {
  const id = crypto.randomUUID();
  const changes: Change[] = [{ kind: "account", id, space_id: spaceId, data: { name: name.trim(), type } satisfies AccountData }];
  if (opening !== 0) changes.push(adjustmentChange(spaceId, id, opening, "Opening balance"));
  await store.apply(changes);
  return id;
}

function adjustmentChange(spaceId: string, accountId: string, amount: number, note: string): Change {
  const base = { type: "adjustment" as const, date: todayManila(), amount, account_id: accountId, note };
  return { kind: "transaction", space_id: spaceId, data: { ...base, entries: buildEntries(base) } satisfies TxData };
}

/** Sum of all recorded opening/adjustment movements for an account. */
export function openingTotal(accountId: string, txs: Tx[]) {
  return txs
    .filter((t) => !t.deleted && t.data.type === "adjustment" && t.data.account_id === accountId)
    .reduce((s, t) => s + t.data.amount, 0);
}

/** Opening balance changes are recorded as a visible adjustment, never a silent overwrite. */
export async function correctOpening(store: LedgerStore, snap: Snapshot, accountId: string, newOpening: number) {
  const acc = snap.accounts.find((a) => a.id === accountId);
  if (!acc) throw new Error("Account not found");
  const diff = newOpening - openingTotal(accountId, snap.transactions);
  if (diff === 0) return;
  await store.apply([adjustmentChange(acc.space_id!, accountId, diff, "Opening balance correction")]);
}

export type TxInput = Omit<TxData, "entries">;

export async function saveTransaction(store: LedgerStore, snap: Snapshot, spaceId: string, input: TxInput, id?: string) {
  const clean: TxInput = { ...input, note: input.note?.trim() || undefined };
  if (clean.type !== "transfer") { delete clean.fee; delete clean.fee_category_id; delete clean.to_account_id; }
  if (clean.type === "transfer" && !clean.fee) { delete clean.fee; delete clean.fee_category_id; }
  const err = validateTx(clean, {
    spaceId,
    accounts: snap.accounts,
    categories: snap.categories,
    loans: snap.loans,
    loanOutstanding: clean.loan_id ? loanOutstanding(clean.loan_id, snap.transactions, id) : undefined,
  });
  if (err) throw new Error(err);
  return store.save<TxData>("transaction", spaceId, { ...clean, entries: buildEntries(clean) }, id);
}

export async function createLoan(
  store: LedgerStore, snap: Snapshot, spaceId: string, loan: Omit<LoanData, "settled_at">,
) {
  const loanId = crypto.randomUUID();
  const tx: TxInput = { type: "lend", date: loan.date, amount: loan.principal, account_id: loan.account_id, loan_id: loanId, note: loan.note };
  const err = validateTx(tx, {
    spaceId, accounts: snap.accounts, categories: snap.categories,
    loans: [{ id: loanId, space_id: spaceId, data: { principal: loan.principal } } as never],
  });
  if (err) throw new Error(err);
  if (!snap.borrowers.some((b) => b.id === loan.borrower_id)) throw new Error("Choose a person.");
  await store.apply([
    { kind: "loan", id: loanId, space_id: spaceId, data: loan },
    { kind: "transaction", space_id: spaceId, data: { ...tx, entries: buildEntries(tx) } },
  ]);
  return loanId;
}

export async function deleteLoan(store: LedgerStore, snap: Snapshot, loanId: string) {
  const ids = [loanId, ...snap.transactions.filter((t) => t.data.loan_id === loanId).map((t) => t.id)];
  await store.remove(ids);
}

export async function setBudget(store: LedgerStore, snap: Snapshot, spaceId: string, categoryId: string, month: string, amount: number) {
  const existing = snap.budgets.find((b) => b.space_id === spaceId && b.data.category_id === categoryId && b.data.month === month);
  if (amount === 0 && existing) return store.remove([existing.id]);
  return store.save<BudgetData>("budget", spaceId, { category_id: categoryId, month, amount }, existing?.id);
}
