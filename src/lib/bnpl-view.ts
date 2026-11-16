import { budgetStatus, installmentStatus, monthOf, type Installment, type InstallmentStatus } from "./bnpl";
import { bnplEnabled } from "./bnpl-actions";
import { bnplOwed, bnplPaidAmounts, bnplPlans, mainSpaces } from "./selectors";
import type { Snapshot } from "./store";
import type { Loan } from "./types";

export interface UpcomingItem {
  planId: string;
  label: string;
  provider: string;
  installment: Installment;
  status: Exclude<InstallmentStatus, "paid">;
  paidAmount: number;
}
export interface PlatformDueGroup {
  id: string;
  provider: string;
  month: string;
  items: UpcomingItem[];
  total: number;
}
export interface PlanProgress {
  plan: Loan;
  paidCount: number;
  total: number;
  owed: number;
}
export interface BnplView {
  enabled: boolean;
  month: string;
  budget: ReturnType<typeof budgetStatus> | null;
  committed: number;
  dueCount: number;
  outstanding: number;
  upcoming: UpcomingItem[];
  platformGroups: PlatformDueGroup[];
  plans: PlanProgress[];
}

/** Read-only BNPL data; partial payments reduce each installment's remaining balance. */
export function bnplView(snap: Snapshot, spaceId: string, today: string): BnplView {
  const month = monthOf(today);
  const plans = bnplPlans(spaceId, snap.spaces, snap.loans).filter(
    (p) => p.data.bnpl && !p.data.bnpl.cancelled,
  );
  const isMain = mainSpaces(snap.spaces).some((s) => s.id === spaceId);
  const enabled = isMain && bnplEnabled(snap, spaceId);
  const empty: BnplView = {
    enabled, month, budget: null, committed: 0, dueCount: 0, outstanding: 0,
    upcoming: [], platformGroups: [], plans: [],
  };
  if (!enabled) return empty;

  const paidAmounts = bnplPaidAmounts(snap.transactions);
  const upcoming: UpcomingItem[] = [];
  const progress: PlanProgress[] = [];
  let committed = 0;
  let dueCount = 0;
  let outstanding = 0;

  for (const plan of plans) {
    const schedule = plan.data.bnpl?.schedule ?? [];
    let paidCount = 0;
    for (const installment of schedule) {
      const paidAmount = paidAmounts.get(installment.id) ?? 0;
      const remaining = Math.max(0, installment.amount - paidAmount);
      if (remaining === 0) {
        paidCount++;
        continue;
      }
      outstanding += remaining;
      if (monthOf(installment.due_date) === month) {
        committed += remaining;
        dueCount++;
      }
      const status = installmentStatus(
        { ...installment, amount: remaining },
        new Set(),
        today,
      );
      upcoming.push({
        planId: plan.id,
        label: plan.data.label ?? "BNPL plan",
        provider: plan.data.bnpl?.provider ?? "",
        installment: { ...installment, amount: remaining },
        status,
        paidAmount,
      });
    }
    if (paidCount < schedule.length)
      progress.push({ plan, paidCount, total: schedule.length, owed: bnplOwed(plan.id, snap.transactions) });
  }

  upcoming.sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date));
  const grouped = new Map<string, PlatformDueGroup>();
  for (const item of upcoming) {
    const key = item.provider.trim().toLocaleLowerCase() + "|" + monthOf(item.installment.due_date);
    const group = grouped.get(key) ?? {
      id: key, provider: item.provider, month: monthOf(item.installment.due_date), items: [], total: 0,
    };
    group.items.push(item);
    group.total += item.installment.amount;
    grouped.set(key, group);
  }
  const limit = snap.spaces.find((s) => s.id === spaceId)?.data.bnpl_budget;
  return {
    enabled: true,
    month,
    budget: typeof limit === "number" ? budgetStatus(limit, committed) : null,
    committed,
    dueCount,
    outstanding,
    upcoming,
    platformGroups: [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month) || a.provider.localeCompare(b.provider)),
    plans: progress,
  };
}

/** Split a total into `n` whole-centavo amounts; any leftover centavos go to the last installments. */
export function evenSplit(total: number, n: number): number[] {
  if (!Number.isSafeInteger(total) || n < 1 || !Number.isSafeInteger(n) || total < 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0));
}
