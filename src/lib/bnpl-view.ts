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
import { bnplPaidIds, bnplPlans } from "./selectors";
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
  const enabled = plans.length > 0 || isMain(snap, spaceId) ? bnplEnabled(snap, spaceId) : false;
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
  if (!enabled || !isMain(snap, spaceId)) return { ...empty, enabled: false };
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

function isMain(snap: Snapshot, spaceId: string) {
  return bnplPlans(spaceId, snap.spaces, []).length === 0 && mainIds(snap).has(spaceId);
}
function mainIds(snap: Snapshot) {
  return new Set(
    snap.spaces
      .filter(
        (s) => !s.deleted && s.data.type === "personal" && !s.data.purpose && !s.data.archived,
      )
      .map((s) => s.id),
  );
}

/** Split a total into `n` whole-centavo amounts; any leftover centavos go to the first ones. */
export function evenSplit(total: number, n: number): number[] {
  if (n < 1 || total < 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
