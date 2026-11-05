import { buildEntries } from "./ledger";
import { isValidDate } from "./dates";
import { MAX_CENTAVOS } from "./money";
import { childSpaces, loanOutstanding } from "./selectors";
import type { LedgerStore } from "./store";
import type { LoanData, SpaceData, TxData, TxType } from "./types";

const validMoney = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTAVOS;
export function moduleEnabled(store: LedgerStore, mainId: string, module: "reimbursements") {
  return store.getSnapshot().spaces.find((s) => s.id === mainId)?.data.modules?.[module] === true;
}
export async function toggleModule(store: LedgerStore, mainId: string, module: "reimbursements", enabled: boolean) {
  const main = store.getSnapshot().spaces.find((s) => s.id === mainId && s.data.type === "personal" && !s.data.purpose);
  if (!main) throw new Error("Choose a Main Space first.");
  await store.save<SpaceData>("space", main.id, { ...main.data, modules: { ...main.data.modules, [module]: enabled } }, main.id);
}
export async function createReimbursementSpace(store: LedgerStore, parentId: string, name: string) {
  if (!moduleEnabled(store, parentId, "reimbursements") || !name.trim()) throw new Error("Enable reimbursements and enter a name.");
  const id = crypto.randomUUID();
  await store.save<SpaceData>("space", id, { name: name.trim(), type: "personal", purpose: "reimbursement", parent_space_id: parentId }, id);
  return id;
}
export interface PositionInput { label: string; accountId: string; date: string; amount: number; note?: string | undefined; reference?: string | undefined; categoryId?: string | undefined; reimbursable?: number | undefined; }
export async function createPosition(store: LedgerStore, mainId: string, targetId: string, module: "reimbursement", input: PositionInput) {
  const snap = store.getSnapshot();
  if (!moduleEnabled(store, mainId, "reimbursements")) throw new Error("Enable this module in Settings.");
  if (!input.label.trim() || !isValidDate(input.date) || !validMoney(input.amount) || input.amount <= 0) throw new Error("Enter a name, valid date and positive amount.");
  if (!snap.accounts.some((a) => a.id === input.accountId && a.space_id === mainId && !a.data.archived)) throw new Error("Choose an account in the Main Space.");
  const covered = input.reimbursable ?? 0;
  if (!validMoney(covered) || covered <= 0 || covered > input.amount) throw new Error("Reimbursable amount must be positive and no more than the amount paid.");
  if (module === "reimbursement" && !childSpaces(mainId, snap.spaces).some((s) => s.id === targetId && s.data.purpose === "reimbursement")) throw new Error("Choose a reimbursement space under this Main Space.");
  if (module === "reimbursement" && input.amount > covered && !snap.categories.some((c) => c.id === input.categoryId && c.space_id === mainId && c.data.type === "expense")) throw new Error("Choose the personal expense category.");
  const id = crypto.randomUUID();
  const data: LoanData = { module, label: input.label.trim(), borrower_id: "", account_id: input.accountId, principal: covered, date: input.date, note: input.note, reference: input.reference, status: "unsubmitted" };
  const tx: Omit<TxData, "entries"> = { type: "reimbursement_claim", date: input.date, amount: input.amount, account_id: input.accountId, loan_id: id, reimbursable: covered, category_id: input.categoryId, note: input.note };
  await store.apply([{ kind: "loan", id, space_id: targetId, data }, { kind: "transaction", space_id: mainId, data: { ...tx, entries: buildEntries(tx) } }]);
  return id;
}
export async function movePosition(store: LedgerStore, mainId: string, id: string, accountId: string, date: string, amount: number) {
  const snap = store.getSnapshot();
  const position = snap.loans.find((l) => l.id === id && l.data.module === "reimbursement");
  if (!position || (position.space_id !== mainId && !childSpaces(mainId, snap.spaces).some((s) => s.id === position.space_id))) throw new Error("Position does not belong to this Main Space.");
  if (!snap.accounts.some((a) => a.id === accountId && a.space_id === mainId && !a.data.archived)) throw new Error("Choose an account in the Main Space.");
  if (!isValidDate(date) || !validMoney(amount) || amount <= 0) throw new Error("Enter a valid date and positive amount.");
  if (amount > loanOutstanding(id, snap.transactions)) throw new Error("Amount is more than the remaining balance.");
  const type: TxType = "reimbursement_payment";
  const tx = { type, date, amount, account_id: accountId, loan_id: id };
  await store.save<TxData>("transaction", mainId, { ...tx, entries: buildEntries(tx) });
}
export async function saveCustomBudget(store: LedgerStore, spaceId: string, categoryId: string, newCategory: string, month: string, amount: number, budgetId?: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validMoney(amount) || amount <= 0) throw new Error("Enter a valid month and positive budget amount.");
  const snap = store.getSnapshot();
  const id = newCategory.trim() ? crypto.randomUUID() : categoryId;
  if (!newCategory.trim() && !snap.categories.some((c) => c.id === id && c.space_id === spaceId && c.data.type === "expense")) throw new Error("Choose an expense category.");
  if (snap.budgets.some((b) => b.id !== budgetId && b.space_id === spaceId && b.data.month === month && b.data.category_id === id)) throw new Error("This category already has a budget for this month.");
  await store.apply([
    ...(newCategory.trim() ? [{ kind: "category" as const, id, space_id: spaceId, data: { name: newCategory.trim(), type: "expense" } }] : []),
    { kind: "budget", id: budgetId, space_id: spaceId, data: { category_id: id, month, amount } },
  ]);
}