import type { Account, Budget, Category, Loan, LocalRecord, Tx, Space } from "./types";

export const live = <T extends LocalRecord>(rs: T[]) => rs.filter((r) => !r.deleted);

export function accountBalance(accountId: string, txs: Tx[]): number {
  let s = 0;
  for (const t of txs)
    if (!t.deleted) for (const e of t.data.entries) if (e.account_id === accountId) s += e.delta;
  return s;
}

export function loanOutstanding(loanId: string, txs: Tx[], excludeTxId?: string): number {
  let s = 0;
  for (const t of txs)
    if (!t.deleted && t.id !== excludeTxId)
      for (const e of t.data.entries) if (e.loan_id === loanId) s += e.delta;
  return s;
}

export function loanRepaid(loanId: string, txs: Tx[]): number {
  return live(txs)
    .filter((t) => t.data.type === "loan_repayment" && t.data.loan_id === loanId)
    .reduce((a, t) => a + t.data.amount, 0);
}

export function spaceCash(spaceId: string, accounts: Account[], txs: Tx[]): number {
  return live(accounts)
    .filter((a) => a.space_id === spaceId)
    .reduce((s, a) => s + accountBalance(a.id, txs), 0);
}

export function spaceReceivable(spaceId: string, loans: Loan[], txs: Tx[]): number {
  return live(loans)
    .filter((l) => l.space_id === spaceId && !l.data.module)
    .reduce((s, l) => s + loanOutstanding(l.id, txs), 0);
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  byCategory: Map<string, { type: "income" | "expense"; total: number }>;
}

/** Income/expense for a space in a period prefix ("2026" or "2026-10"). Only `report` entries count. */
export function periodTotals(spaceId: string, txs: Tx[], prefix: string): PeriodTotals {
  const r: PeriodTotals = { income: 0, expense: 0, net: 0, byCategory: new Map() };
  for (const t of txs) {
    if (t.deleted || t.space_id !== spaceId || !t.data.date.startsWith(prefix)) continue;
    for (const e of t.data.entries) {
      if (!e.report) continue;
      const amt = Math.abs(e.delta);
      if (e.report === "income") r.income += amt;
      else r.expense += amt;
      const k = e.category_id ?? "uncategorized";
      const cur = r.byCategory.get(k) ?? { type: e.report, total: 0 };
      cur.total += amt;
      r.byCategory.set(k, cur);
    }
  }
  r.net = r.income - r.expense;
  return r;
}

export function budgetRows(
  spaceId: string,
  month: string,
  categories: Category[],
  budgets: Budget[],
  txs: Tx[],
) {
  const totals = periodTotals(spaceId, txs, month);
  return live(categories)
    .filter(
      (c) =>
        c.space_id === spaceId &&
        c.data.type === "expense" &&
        live(budgets).some(
          (b) => b.space_id === spaceId && b.data.month === month && b.data.category_id === c.id,
        ),
    )
    .map((c) => {
      const b = live(budgets).find(
        (x) => x.space_id === spaceId && x.data.category_id === c.id && x.data.month === month,
      );
      const spent = totals.byCategory.get(c.id)?.total ?? 0;
      const limit = b?.data.amount ?? 0;
      return {
        category: c,
        budget: b,
        limit,
        spent,
        remaining: limit - spent,
        pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
        over: limit > 0 && spent > limit,
      };
    });
}

export function mainSpaces(spaces: Space[]) {
  return live(spaces).filter(
    (s) => s.data.type === "personal" && !s.data.purpose && !s.data.archived,
  );
}

export function childSpaces(parentId: string, spaces: Space[]) {
  const primary = mainSpaces(spaces)[0]?.id;
  return live(spaces).filter(
    (s) =>
      !s.data.archived &&
      (s.data.type === "managed" || s.data.purpose === "reimbursement") &&
      (s.data.parent_space_id === parentId ||
        (!s.data.parent_space_id && s.data.type === "managed" && primary === parentId)),
  );
}

/** Home shows only managed children of the selected active Main Space. */
export function homeSpaceOverview(spaceId: string, spaces: Space[]): Space[] {
  if (!mainSpaces(spaces).some((s) => s.id === spaceId)) return [];
  return childSpaces(spaceId, spaces).filter((s) => s.data.type === "managed" && !s.data.purpose);
}

/** Managed-space editing must not reveal other spaces. */
export function spacesPageSpaces(spaceId: string | null, spaces: Space[]): Space[] {
  const selected = spaces.find((s) => s.id === spaceId);
  return live(spaces).filter((s) =>
    selected?.data.type === "managed" ? s.id === spaceId : !s.data.purpose,
  );
}

export function ordinaryLoans(loans: Loan[]): Loan[] {
  return loans.filter((l) => !l.data.module);
}

/** Home chart: income vs expense for the `count` months ending at `endMonth` (YYYY-MM). */
export function monthlyTrend(spaceId: string, txs: Tx[], endMonth: string, count = 6) {
  const out: { month: string; income: number; expense: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const [y = 0, m = 1] = endMonth.split("-").map(Number);
    const t = y * 12 + (m - 1) - i;
    const month = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
    const p = periodTotals(spaceId, txs, month);
    out.push({ month, income: p.income, expense: p.expense });
  }
  return out;
}

/** Home chart: expense totals by category for one month; "uncategorized" kept as its own row. */
export function expenseBreakdown(spaceId: string, txs: Tx[], month: string) {
  return [...periodTotals(spaceId, txs, month).byCategory]
    .filter(([, v]) => v.type === "expense" && v.total > 0)
    .map(([categoryId, v]) => ({ categoryId, total: v.total }))
    .sort((a, b) => b.total - a.total);
}

/** BNPL plans belong only to an active Main Space; any other selection sees none. */
export function bnplPlans(spaceId: string, spaces: Space[], loans: Loan[]): Loan[] {
  if (!mainSpaces(spaces).some((s) => s.id === spaceId)) return [];
  return live(loans).filter((l) => l.space_id === spaceId && l.data.module === "bnpl");
}

export function bnplPaidIds(txs: Tx[]): Set<string> {
  const ids = new Set<string>();
  for (const t of live(txs))
    if (t.data.type === "bnpl_payment" && t.data.installment_id) ids.add(t.data.installment_id);
  return ids;
}

/** Remaining BNPL obligation as a positive number (never -0). */
export const bnplOwed = (planId: string, txs: Tx[]) => 0 - loanOutstanding(planId, txs);

/** Module transactions are managed on their own pages, not in the generic dialog. */
export const isModuleTx = (tx: Tx) =>
  tx.data.type.startsWith("reimbursement_") || tx.data.type.startsWith("bnpl_");
