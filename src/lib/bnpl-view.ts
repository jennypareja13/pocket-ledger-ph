import {
  budgetStatus,
  installmentStatus,
  monthCommitment,
  monthOf,
  outstandingTotal,
  type Installment,
  type InstallmentStatus,
} from "./bnpl";
import { bnplEnabled } from "./bnpl-actions";
import { bnplPaidIds, bnplPlans, mainSpaces } from "./selectors";
import type { Snapshot } from "./store";
import type { Loan } from "./types";

export interface UpcomingItem {
  planId: string;
  label: string;
  provider: string;
  installment: Installment;
  status: Exclude<InstallmentStatus, "paid">;
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
  plans: PlanProgress[];
}

/** Read-only page data for the BNPL screen. Status is reported only; nothing is marked paid by date. */
export function bnplView(snap: Snapshot, spaceId: string, today: string): BnplView {
  const month = monthOf(today);
  const plans = bnplPlans(spaceId, snap.spaces, snap.loans).filter(
    (p) => p.data.bnpl && !p.data.bnpl.cancelled,
  );
  const isMain = mainSpaces(snap.spaces).some((s) => s.id === spaceId);
  const enabled = isMain && bnplEnabled(snap, spaceId);
  const empty: BnplView = {
    enabled,
    month,
    budget: null,
    committed: 0,
    dueCount: 0,
    outstanding: 0,
    upcoming: [],
    plans: [],
  };
  if (!enabled) return empty;
  const paid = bnplPaidIds(snap.transactions);
  const like = plans.map((p) => ({ data: { schedule: p.data.bnpl?.schedule ?? [] } }));
  const { committed, count } = monthCommitment(like, month, paid);
  const limit = snap.spaces.find((s) => s.id === spaceId)?.data.bnpl_budget;
  const upcoming: UpcomingItem[] = [];
  const progress: PlanProgress[] = [];
  for (const plan of plans) {
    const schedule = plan.data.bnpl?.schedule ?? [];
    let paidCount = 0;
    let owed = 0;
    for (const i of schedule) {
      const status = installmentStatus(i, paid, today);
      if (status === "paid") {
        paidCount++;
        continue;
      }
      owed += i.amount;
      upcoming.push({
        planId: plan.id,
        label: plan.data.label ?? "BNPL plan",
        provider: plan.data.bnpl?.provider ?? "",
        installment: i,
        status,
      });
    }
    if (paidCount < schedule.length)
      progress.push({ plan, paidCount, total: schedule.length, owed });
  }
  upcoming.sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date));
  return {
    enabled: true,
    month,
    budget: typeof limit === "number" ? budgetStatus(limit, committed) : null,
    committed,
    dueCount: count,
    outstanding: outstandingTotal(like, paid),
    upcoming,
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
