import { parseDate, type Installment } from "./bnpl";

/** Reminder days relative to an installment due date. D-6 is intentionally omitted. */
export const BNPL_REMINDER_OFFSETS = [7, 5, 4, 3, 2, 1, 0] as const;

export type BnplReminderOffset = (typeof BNPL_REMINDER_OFFSETS)[number];

export interface BnplReminderOccurrence {
  /** Stable for this plan, installment, due date, and reminder offset. */
  id: string;
  planId: string;
  installmentId: string;
  dueDate: string;
  reminderDate: string;
  daysBeforeDue: BnplReminderOffset;
  kind: "heads_up" | "countdown" | "due_day";
}

export interface ReminderInstallment {
  planId: string;
  installment: Installment;
  paid?: boolean;
  cancelled?: boolean;
}

/** Convert a validated civil date to an integer day without local-time or DST behavior. */
function dayNumber(value: string): number {
  const parsed = parseDate(value);
  if (!parsed) throw new Error("Enter a valid calendar date.");
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parsed.y, parsed.m - 1, parsed.d);
  return date.getTime() / 86_400_000;
}

/** Add whole calendar days in UTC, independent of device time zone and DST. */
function addCalendarDays(value: string, amount: number): string {
  const day = dayNumber(value);
  if (!Number.isSafeInteger(amount)) throw new Error("Day offset must be a whole number.");
  const date = new Date((day + amount) * 86_400_000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return String(year).padStart(4, "0") + "-" + month + "-" + dayOfMonth;
}

/**
 * Build the complete reminder schedule for one installment.
 * Dates are civil calendar dates; callers supply the current Asia/Manila date
 * when asking which reminder should be surfaced today.
 */
export function bnplReminderSchedule(
  planId: string,
  installment: Installment,
): BnplReminderOccurrence[] {
  if (!planId.trim() || !installment.id.trim())
    throw new Error("Reminder identifiers are required.");
  dayNumber(installment.due_date);

  return BNPL_REMINDER_OFFSETS.map((daysBeforeDue) => {
    const reminderDate = addCalendarDays(installment.due_date, -daysBeforeDue);
    const kind = daysBeforeDue === 7 ? "heads_up" : daysBeforeDue === 0 ? "due_day" : "countdown";
    return {
      id: [
        "bnpl-reminder",
        encodeURIComponent(planId),
        encodeURIComponent(installment.id),
        installment.due_date,
        "D-" + daysBeforeDue,
      ].join(":"),
      planId,
      installmentId: installment.id,
      dueDate: installment.due_date,
      reminderDate,
      daysBeforeDue,
      kind,
    };
  });
}

/**
 * Return only reminders scheduled for today; past occurrences are omitted,
 * preventing a backlog when a user returns after being offline or re-enables BNPL.
 */
export function dueBnplReminders(
  installments: readonly ReminderInstallment[],
  today: string,
  enabled = true,
): BnplReminderOccurrence[] {
  if (!enabled) return [];
  dayNumber(today);

  const seen = new Set<string>();
  const due: BnplReminderOccurrence[] = [];
  for (const item of installments) {
    if (item.paid || item.cancelled) continue;
    for (const reminder of bnplReminderSchedule(item.planId, item.installment)) {
      if (reminder.reminderDate !== today || seen.has(reminder.id)) continue;
      seen.add(reminder.id);
      due.push(reminder);
    }
  }
  return due.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.planId.localeCompare(b.planId) ||
      a.installmentId.localeCompare(b.installmentId),
  );
}
