import type { Entry } from "./types";

/**
 * BNPL core logic: pure functions, integer centavos only, no floating point.
 * Ledger model (reuses the existing `loan_id` leg; a BNPL plan is a loan-kind record with
 * module "bnpl"). Owed amounts are NEGATIVE on the loan leg, so
 *   outstanding obligation = -loanOutstanding(planId, txs).
 *  - purchase: expense once (+ fees/interest as a separate expense); cash does not move.
 *  - payment: cash down, obligation down, never a second ordinary expense.
 */

/** Duration is editable: quick presets in the UI, or any whole number of months up to the max. */
export const BNPL_DURATION_PRESETS = [1, 3, 6, 9, 12, 18, 24] as const;
export const BNPL_MAX_MONTHS = 36;
export const isValidDuration = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 1 && n <= BNPL_MAX_MONTHS;

export interface Installment {
  id: string;
  /** YYYY-MM-DD (Asia/Manila calendar date, no time zone math). */
  due_date: string;
  /** Integer centavos. */
  amount: number;
}
export interface BnplPlanData {
  /** Number of monthly installments; always equals schedule.length. */
  months: number;
  provider: string;
  purchase_total?: number | undefined;
  schedule: Installment[];
  cancelled?: boolean | undefined;
}

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

// ---- date helpers (civil calendar, no Date object, no time zones) ----
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

export function parseDate(s: string): { y: number; m: number; d: number } | null {
  const g = DATE_RE.exec(s);
  if (!g) return null;
  const y = Number(g[1]);
  const m = Number(g[2]);
  const d = Number(g[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}
const fmt = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Add whole months, anchored to the original day-of-month and clamped to month end. */
export function addMonthsClamped(date: string, n: number): string {
  const p = parseDate(date);
  if (!p) throw new Error("Invalid date.");
  const t = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(t / 12);
  const m = (t % 12) + 1;
  return fmt(y, m, Math.min(p.d, daysInMonth(y, m)));
}
export const monthOf = (date: string) => date.slice(0, 7);

// ---- schedule ----
/** Monthly due dates only. Amounts are never guessed: the user types each month's exact payment. */
export function scheduleDates(firstDue: string, months: number): string[] {
  if (!parseDate(firstDue)) throw new Error("Enter a valid first due date.");
  if (!isValidDuration(months))
    throw new Error(`Duration must be a whole number of months from 1 to ${BNPL_MAX_MONTHS}.`);
  return Array.from({ length: months }, (_, i) => addMonthsClamped(firstDue, i));
}

/** One installment per entered amount (centavos, exact, per month). Duration = amounts.length. */
export function buildSchedule(
  firstDue: string,
  amounts: readonly number[],
  newId: () => string,
): Installment[] {
  const dates = scheduleDates(firstDue, amounts.length);
  return dates.map((due_date, i) => {
    const amount = amounts[i];
    if (!isInt(amount) || amount <= 0)
      throw new Error(`Enter the exact payment for month ${i + 1}.`);
    return { id: newId(), due_date, amount };
  });
}

export function validateSchedule(s: Installment[]): string | null {
  if (!s.length || s.length > BNPL_MAX_MONTHS)
    return `A plan needs 1 to ${BNPL_MAX_MONTHS} installments.`;
  const ids = new Set<string>();
  for (const i of s) {
    if (!i.id || ids.has(i.id)) return "Installment ids must be unique.";
    ids.add(i.id);
    if (!parseDate(i.due_date)) return "Every installment needs a valid due date.";
    if (!isInt(i.amount) || i.amount <= 0) return "Every installment needs a positive amount.";
  }
  return null;
}
export const scheduleTotal = (s: Installment[]) => s.reduce((a, i) => a + i.amount, 0);

/**
 * Split the obligation into purchase spending and fees/interest.
 * No purchase total entered: the whole obligation is recorded as the purchase.
 */
export function splitObligation(total: number, purchaseTotal?: number) {
  if (purchaseTotal === undefined) return { purchase: total, fees: 0 };
  if (!isInt(purchaseTotal) || purchaseTotal <= 0)
    throw new Error("Purchase total must be positive.");
  if (purchaseTotal > total)
    throw new Error(
      "Purchase total is more than the installments. Record any upfront payment as a normal expense.",
    );
  return { purchase: purchaseTotal, fees: total - purchaseTotal };
}

// ---- ledger entries ----
export function bnplPurchaseEntries(a: {
  loanId: string;
  purchase: number;
  fees: number;
  categoryId?: string | undefined;
  feeCategoryId?: string | undefined;
}): Entry[] {
  if (!isInt(a.purchase) || a.purchase <= 0 || !isInt(a.fees) || a.fees < 0)
    throw new Error("Invalid amounts.");
  const e: Entry[] = [
    { loan_id: a.loanId, delta: -a.purchase, report: "expense", category_id: a.categoryId },
  ];
  if (a.fees > 0)
    e.push({ loan_id: a.loanId, delta: -a.fees, report: "expense", category_id: a.feeCategoryId });
  return e;
}

/** `scheduled` clears the obligation. `extra` (late fee etc.) is a separate expense, not obligation. */
export function bnplPaymentEntries(a: {
  loanId: string;
  accountId: string;
  scheduled: number;
  extra?: number | undefined;
  feeCategoryId?: string | undefined;
}): Entry[] {
  const extra = a.extra ?? 0;
  if (!isInt(a.scheduled) || a.scheduled <= 0 || !isInt(extra) || extra < 0)
    throw new Error("Invalid amounts.");
  const e: Entry[] = [
    { account_id: a.accountId, delta: -a.scheduled },
    { loan_id: a.loanId, delta: a.scheduled },
  ];
  if (extra > 0)
    e.push({
      account_id: a.accountId,
      delta: -extra,
      report: "expense",
      category_id: a.feeCategoryId,
    });
  return e;
}

/** Actual paid vs scheduled. Short payments are a later release (partial payments). */
export function splitPayment(scheduled: number, actualPaid: number) {
  if (!isInt(actualPaid) || actualPaid <= 0) throw new Error("Enter the amount actually paid.");
  if (actualPaid < scheduled)
    throw new Error(
      "Partial payments are not supported yet. Edit the installment amount before paying.",
    );
  return { scheduled, extra: actualPaid - scheduled };
}

/** Deterministic UUID-shaped id so two devices marking the same installment paid write the SAME record. */
export async function deterministicId(namespace: string, key: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${namespace}:${key}`)),
  );
  const b = bytes.slice(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x50;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- status, commitments, budget ----
export type InstallmentStatus = "paid" | "due_today" | "upcoming" | "past_due_unconfirmed";
export function installmentStatus(
  i: Installment,
  paid: ReadonlySet<string>,
  today: string,
): InstallmentStatus {
  if (paid.has(i.id)) return "paid";
  if (i.due_date === today) return "due_today";
  return i.due_date < today ? "past_due_unconfirmed" : "upcoming";
}

interface PlanLike {
  data: Pick<BnplPlanData, "schedule" | "cancelled">;
}
const activePlans = <P extends PlanLike>(plans: P[]) => plans.filter((p) => !p.data.cancelled);

/** Unpaid installments due in a calendar month, across all plans and providers. */
export function monthCommitment<P extends PlanLike>(
  plans: P[],
  month: string,
  paid: ReadonlySet<string>,
) {
  let committed = 0;
  let count = 0;
  for (const p of activePlans(plans))
    for (const i of p.data.schedule)
      if (monthOf(i.due_date) === month && !paid.has(i.id)) {
        committed += i.amount;
        count++;
      }
  return { committed, count };
}
/** Future obligation across all months. Separate from the monthly budget. */
export function outstandingTotal<P extends PlanLike>(plans: P[], paid: ReadonlySet<string>) {
  let t = 0;
  for (const p of activePlans(plans))
    for (const i of p.data.schedule) if (!paid.has(i.id)) t += i.amount;
  return t;
}
export function budgetStatus(limit: number, committed: number) {
  return {
    limit,
    committed,
    remaining: limit - committed,
    pct: limit > 0 ? Math.round((committed / limit) * 100) : 0,
    over: limit > 0 && committed > limit,
  };
}
/** Advisory preview before saving a plan: months that would exceed the budget. Never blocks saving. */
export function budgetImpact<P extends PlanLike>(
  existing: P[],
  newSchedule: Installment[],
  limit: number,
  paid: ReadonlySet<string>,
) {
  const months = [...new Set(newSchedule.map((i) => monthOf(i.due_date)))].sort();
  return months.map((month) => {
    const add = newSchedule
      .filter((i) => monthOf(i.due_date) === month)
      .reduce((a, i) => a + i.amount, 0);
    const committed = monthCommitment(existing, month, paid).committed + add;
    return { month, ...budgetStatus(limit, committed) };
  });
}
