import { parseDate, type BnplPlanData, type Installment } from "./bnpl";

export const BNPL_REMINDER_OFFSETS = [5, 4, 3, 2, 1, 0] as const;
export type BnplReminderOffset = (typeof BNPL_REMINDER_OFFSETS)[number];

export interface BnplReminderOccurrence {
  id: string;
  planId: string;
  installmentId: string;
  provider: string;
  dueDate: string;
  reminderDate: string;
  daysBeforeDue: BnplReminderOffset;
  kind: "countdown" | "due_day";
}

export interface ReminderPlan {
  id: string;
  data: Pick<BnplPlanData, "provider" | "schedule" | "cancelled">;
}

function dayNumber(value: string): number {
  const parsed = parseDate(value);
  if (!parsed) throw new Error("Enter a valid calendar date.");
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parsed.y, parsed.m - 1, parsed.d);
  return date.getTime() / 86_400_000;
}

function addCalendarDays(value: string, amount: number): string {
  const date = new Date((dayNumber(value) + amount) * 86_400_000);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The caller supplies today's Asia/Manila civil date (YYYY-MM-DD). */
export function bnplReminderSchedule(
  plan: Pick<ReminderPlan, "id" | "data">,
  installment: Installment,
): BnplReminderOccurrence[] {
  if (!plan.id.trim() || !installment.id.trim()) {
    throw new Error("Reminder identifiers are required.");
  }
  dayNumber(installment.due_date);

  return BNPL_REMINDER_OFFSETS.map((daysBeforeDue) => {
    const reminderDate = addCalendarDays(installment.due_date, -daysBeforeDue);
    return {
      id: [
        "bnpl-reminder",
        encodeURIComponent(plan.id),
        encodeURIComponent(installment.id),
        installment.due_date,
        `D-${daysBeforeDue}`,
      ].join(":"),
      planId: plan.id,
      installmentId: installment.id,
      provider: plan.data.provider,
      dueDate: installment.due_date,
      reminderDate,
      daysBeforeDue,
      kind: daysBeforeDue === 0 ? "due_day" : "countdown",
    };
  });
}

/**
 * Calculates only reminders scheduled for today. Missed occurrences are not replayed
 * after an app restart, offline period, or late creation of a BNPL plan.
 * Paid installments, cancelled plans, and disabled BNPL are excluded.
 */
export function dueBnplReminders(
  plans: readonly ReminderPlan[],
  today: string,
  paidInstallmentIds: ReadonlySet<string>,
  enabled = true,
): BnplReminderOccurrence[] {
  if (!enabled) return [];
  dayNumber(today);

  const seen = new Set<string>();
  const due: BnplReminderOccurrence[] = [];
  for (const plan of plans) {
    if (plan.data.cancelled) continue;
    for (const installment of plan.data.schedule) {
      if (paidInstallmentIds.has(installment.id)) continue;
      for (const reminder of bnplReminderSchedule(plan, installment)) {
        if (reminder.reminderDate !== today || seen.has(reminder.id)) continue;
        seen.add(reminder.id);
        due.push(reminder);
      }
    }
  }

  return due.sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.planId.localeCompare(b.planId) ||
      a.installmentId.localeCompare(b.installmentId),
  );
}
