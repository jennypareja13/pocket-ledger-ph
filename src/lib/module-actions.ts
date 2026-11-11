import { MAX_CENTAVOS } from "./money";
import type { LedgerStore } from "./store";

const validMoney = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTAVOS;

export async function saveCustomBudget(
  store: LedgerStore,
  spaceId: string,
  categoryId: string,
  newCategory: string,
  month: string,
  amount: number,
  budgetId?: string,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validMoney(amount) || amount <= 0)
    throw new Error("Enter a valid month and positive budget amount.");
  const snap = store.getSnapshot();
  const id = newCategory.trim() ? crypto.randomUUID() : categoryId;
  if (
    !newCategory.trim() &&
    !snap.categories.some((c) => c.id === id && c.space_id === spaceId && c.data.type === "expense")
  )
    throw new Error("Choose an expense category.");
  if (
    snap.budgets.some(
      (b) =>
        b.id !== budgetId &&
        b.space_id === spaceId &&
        b.data.month === month &&
        b.data.category_id === id,
    )
  )
    throw new Error("This category already has a budget for this month.");
  await store.apply([
    ...(newCategory.trim()
      ? [
          {
            kind: "category" as const,
            id,
            space_id: spaceId,
            data: { name: newCategory.trim(), type: "expense" },
          },
        ]
      : []),
    { kind: "budget", id: budgetId, space_id: spaceId, data: { category_id: id, month, amount } },
  ]);
}
