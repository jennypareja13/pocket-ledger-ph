import {
  deterministicId,
  scheduleTotal,
  splitObligation,
  splitPayment,
  validateSchedule,
  type Installment,
} from "./bnpl";
import { isValidDate } from "./dates";
import { buildEntries } from "./ledger";
import { MAX_CENTAVOS } from "./money";
import { bnplPaidIds, mainSpaces } from "./selectors";
import type { Change, LedgerStore, Snapshot } from "./store";
import type { LoanData, TxData } from "./types";
import { validateRecord } from "./validate-record";

const feeName = "BNPL fees & interest";
const validMoney = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTAVOS;

function requireMain(snap: Snapshot, mainId: string) {
  const main = mainSpaces(snap.spaces).find((space) => space.id === mainId);
  if (!main) throw new Error("Choose an active Main Space.");
  return main;
}

export function bnplEnabled(snap: Snapshot, mainId: string): boolean {
  return snap.spaces.find((space) => space.id === mainId)?.data.modules?.bnpl !== false;
}

// Check the entire batch before the single durable write, including optional text and money limits.
async function applyValidated(store: LedgerStore, changes: Change[]) {
  const at = new Date().toISOString();
  const ready = changes.map((change) => ({ ...change, id: change.id ?? crypto.randomUUID() }));
  for (const change of ready) {
    const result = validateRecord(
      { ...change, deleted: change.deleted ?? false, created_at: at, updated_at: at },
      { idPolicy: "uuid" },
    );
    if (!result.ok) throw new Error(result.reason);
  }
  await store.apply(ready);
}

export async function toggleBnpl(store: LedgerStore, mainId: string, enabled: boolean) {
  const main = requireMain(store.getSnapshot(), mainId);
  if (typeof enabled !== "boolean") throw new Error("Choose whether BNPL is enabled.");
  await applyValidated(store, [
    {
      kind: "space",
      id: main.id,
      space_id: main.space_id,
      data: { ...main.data, modules: { ...main.data.modules, bnpl: enabled } },
    },
  ]);
}

export async function setBnplBudget(store: LedgerStore, mainId: string, centavos: number | null) {
  const main = requireMain(store.getSnapshot(), mainId);
  if (centavos !== null && !validMoney(centavos))
    throw new Error("BNPL budget must be a non-negative amount in whole centavos.");
  const data = { ...main.data };
  if (centavos === null) delete data.bnpl_budget;
  else data.bnpl_budget = centavos;
  await applyValidated(store, [{ kind: "space", id: main.id, space_id: main.space_id, data }]);
}

function feeCategory(snap: Snapshot, mainId: string, changes: Change[]): string {
  const existing = snap.categories.find(
    (category) =>
      category.space_id === mainId &&
      category.data.type === "expense" &&
      !category.data.archived &&
      category.data.name === feeName,
  );
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  changes.push({
    kind: "category",
    id,
    space_id: mainId,
    data: { name: feeName, type: "expense" },
  });
  return id;
}

export interface CreatePlanInput {
  description: string;
  provider: string;
  purchaseDate: string;
  categoryId: string;
  purchaseTotal?: number | undefined;
  schedule: Installment[];
  note?: string | undefined;
}

export async function createPlan(store: LedgerStore, mainId: string, input: CreatePlanInput) {
  const snap = store.getSnapshot();
  requireMain(snap, mainId);
  if (!bnplEnabled(snap, mainId)) throw new Error("Enable BNPL before creating a plan.");
  if (!input.description.trim()) throw new Error("Enter a purchase description.");
  if (!input.provider.trim() || input.provider.trim().length > 100)
    throw new Error("Enter a provider name of 1 to 100 characters.");
  if (!isValidDate(input.purchaseDate)) throw new Error("Enter a valid purchase date.");
  if (
    !snap.categories.some(
      (category) =>
        category.id === input.categoryId &&
        category.space_id === mainId &&
        category.data.type === "expense" &&
        !category.data.archived,
    )
  )
    throw new Error("Choose an expense category in the Main Space.");
  const reason = validateSchedule(input.schedule);
  if (reason) throw new Error(reason);
  const total = scheduleTotal(input.schedule);
  if (!validMoney(total)) throw new Error("Installment total exceeds the allowed money limit.");
  const { fees } = splitObligation(total, input.purchaseTotal);
  const id = crypto.randomUUID();
  const changes: Change[] = [];
  const feeId = fees > 0 ? feeCategory(snap, mainId, changes) : undefined;
  const data: LoanData = {
    module: "bnpl",
    principal: total,
    borrower_id: "",
    account_id: "",
    label: input.description.trim(),
    date: input.purchaseDate,
    note: input.note,
    bnpl: {
      months: input.schedule.length,
      provider: input.provider.trim(),
      purchase_total: input.purchaseTotal,
      schedule: input.schedule.map((item) => ({ ...item })),
    },
  };
  const tx: Omit<TxData, "entries"> = {
    type: "bnpl_purchase",
    date: input.purchaseDate,
    amount: total,
    fee: fees,
    account_id: "",
    category_id: input.categoryId,
    fee_category_id: feeId,
    loan_id: id,
    note: input.note,
  };
  changes.push(
    { kind: "loan", id, space_id: mainId, data },
    { kind: "transaction", space_id: mainId, data: { ...tx, entries: buildEntries(tx) } },
  );
  await applyValidated(store, changes);
  return id;
}

function requirePlan(snap: Snapshot, planId: string) {
  const plan = snap.loans.find((loan) => loan.id === planId && loan.data.module === "bnpl");
  if (!plan?.data.bnpl || !plan.space_id) throw new Error("BNPL plan not found.");
  requireMain(snap, plan.space_id);
  if (plan.data.bnpl.cancelled) throw new Error("This BNPL plan is cancelled.");
  return { plan, bnpl: plan.data.bnpl, mainId: plan.space_id };
}

export async function markInstallmentPaid(
  store: LedgerStore,
  mainId: string,
  planId: string,
  installmentId: string,
  input: { accountId: string; date: string; actualPaid: number },
) {
  const id = await deterministicId("bnpl-payment", installmentId);
  // Read after hashing so a payment that completed during the await is still detected.
  const snap = store.getSnapshot();
  const { bnpl, mainId: ownerId } = requirePlan(snap, planId);
  if (ownerId !== mainId) throw new Error("Choose a BNPL plan in this Main Space.");
  const installment = bnpl.schedule.find((item) => item.id === installmentId);
  if (!installment) throw new Error("Installment not found in this plan.");
  if (bnplPaidIds(snap.transactions).has(installmentId))
    throw new Error("This installment is already paid.");
  if (
    !snap.accounts.some(
      (account) =>
        account.id === input.accountId && account.space_id === mainId && !account.data.archived,
    )
  )
    throw new Error("Choose an active account in the Main Space.");
  if (!isValidDate(input.date)) throw new Error("Enter a valid payment date.");
  if (!validMoney(input.actualPaid)) throw new Error("Enter a valid amount actually paid.");
  const { scheduled, extra } = splitPayment(installment.amount, input.actualPaid);
  const changes: Change[] = [];
  const feeId = extra > 0 ? feeCategory(snap, mainId, changes) : undefined;
  const tx: Omit<TxData, "entries"> = {
    type: "bnpl_payment",
    account_id: input.accountId,
    date: input.date,
    amount: scheduled,
    fee: extra,
    fee_category_id: feeId,
    installment_id: installmentId,
    loan_id: planId,
  };
  changes.push({
    kind: "transaction",
    id,
    space_id: mainId,
    data: { ...tx, entries: buildEntries(tx) },
  });
  await applyValidated(store, changes);
  return id;
}

export async function updateInstallmentDueDate(
  store: LedgerStore,
  planId: string,
  installmentId: string,
  newDate: string,
) {
  const snap = store.getSnapshot();
  const { plan, bnpl } = requirePlan(snap, planId);
  if (!bnpl.schedule.some((item) => item.id === installmentId))
    throw new Error("Installment not found in this plan.");
  if (bnplPaidIds(snap.transactions).has(installmentId))
    throw new Error("Paid installment dates cannot be changed.");
  if (!isValidDate(newDate)) throw new Error("Enter a valid due date.");
  const schedule = bnpl.schedule.map((item) =>
    item.id === installmentId ? { ...item, due_date: newDate } : { ...item },
  );
  const reason = validateSchedule(schedule);
  if (reason) throw new Error(reason);
  await applyValidated(store, [
    {
      kind: "loan",
      id: plan.id,
      space_id: plan.space_id,
      data: { ...plan.data, bnpl: { ...bnpl, schedule } },
    },
  ]);
}

export async function deletePlan(store: LedgerStore, planId: string) {
  const snap = store.getSnapshot();
  const { plan } = requirePlan(snap, planId);
  const linked = snap.transactions.filter((tx) => tx.data.loan_id === planId);
  if (linked.some((tx) => tx.data.type === "bnpl_payment"))
    throw new Error("A plan with payments cannot be deleted.");
  await applyValidated(
    store,
    [plan, ...linked.filter((tx) => tx.data.type === "bnpl_purchase")].map((record) => ({
      kind: record.kind,
      id: record.id,
      space_id: record.space_id,
      data: record.data,
      deleted: true,
    })),
  );
}
