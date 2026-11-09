import { describe, expect, it } from "vitest";
import { buildSchedule, type BnplPlanData } from "@/lib/bnpl";
import {
  BNPL_REMINDER_OFFSETS,
  bnplReminderSchedule,
  dueBnplReminders,
  type ReminderPlan,
} from "@/lib/bnpl-reminders";

let nextId = 0;
const makePlan = (
  id: string,
  provider: string,
  dueDate: string,
  cancelled = false,
): ReminderPlan => ({
  id,
  data: {
    months: 1,
    provider,
    cancelled,
    schedule: buildSchedule(dueDate, [10_000], () => `inst-${++nextId}`),
  } satisfies BnplPlanData,
});

describe("BNPL reminder engine", () => {
  it("uses exactly D-5 through D-1 and the due date, with no D-6 or D-7", () => {
    const plan = makePlan("plan-1", "Shopee", "2026-11-16");
    const installment = plan.data.schedule[0];
    if (!installment) throw new Error("fixture");
    const schedule = bnplReminderSchedule(plan, installment);

    expect(BNPL_REMINDER_OFFSETS).toEqual([5, 4, 3, 2, 1, 0]);
    expect(schedule.map((item) => item.daysBeforeDue)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(schedule.map((item) => item.reminderDate)).toEqual([
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(schedule.at(-1)?.kind).toBe("due_day");
  });

  it("handles month-end, year-end, and leap-year boundaries", () => {
    const plan = makePlan("p", "Shopee", "2028-03-01");
    const installment = plan.data.schedule[0];
    if (!installment) throw new Error("fixture");
    expect(bnplReminderSchedule(plan, installment)[0]?.reminderDate).toBe("2028-02-25");

    const yearEnd = makePlan("p2", "TikTok", "2027-01-01");
    const yearEndInstallment = yearEnd.data.schedule[0];
    if (!yearEndInstallment) throw new Error("fixture");
    expect(bnplReminderSchedule(yearEnd, yearEndInstallment)[0]?.reminderDate).toBe(
      "2026-12-27",
    );
  });

  it("returns only the occurrence due on the supplied Manila calendar date", () => {
    const plan = makePlan("p", "Shopee", "2026-11-16");
    expect(dueBnplReminders([plan], "2026-11-11", new Set()).map((r) => r.daysBeforeDue)).toEqual([
      5,
    ]);
    expect(dueBnplReminders([plan], "2026-11-10", new Set())).toEqual([]);
    expect(dueBnplReminders([plan], "2026-11-17", new Set())).toEqual([]);
  });

  it("does not replay missed reminders for late-created schedules", () => {
    const plan = makePlan("late", "Shopee", "2026-11-16");
    expect(dueBnplReminders([plan], "2026-11-13", new Set()).map((r) => r.daysBeforeDue)).toEqual([
      3,
    ]);
    expect(dueBnplReminders([plan], "2026-11-14", new Set()).map((r) => r.daysBeforeDue)).toEqual([
      2,
    ]);
  });

  it("suppresses paid installments and cancelled plans", () => {
    const paidPlan = makePlan("paid", "Shopee", "2026-11-16");
    const paidInstallment = paidPlan.data.schedule[0];
    if (!paidInstallment) throw new Error("fixture");
    const cancelledPlan = makePlan("cancelled", "TikTok", "2026-11-16", true);
    expect(
      dueBnplReminders([paidPlan, cancelledPlan], "2026-11-11", new Set([paidInstallment.id])),
    ).toEqual([]);
  });

  it("suppresses all reminders when BNPL is disabled", () => {
    const plan = makePlan("p", "Shopee", "2026-11-16");
    expect(dueBnplReminders([plan], "2026-11-11", new Set(), false)).toEqual([]);
  });

  it("keeps reminders for different providers and installments independent", () => {
    const shopee = makePlan("shopee", "Shopee", "2026-11-16");
    const tiktok = makePlan("tiktok", "TikTok", "2026-11-16");
    const reminders = dueBnplReminders([shopee, tiktok], "2026-11-11", new Set());
    expect(reminders).toHaveLength(2);
    expect(reminders.map((r) => r.provider).sort()).toEqual(["Shopee", "TikTok"]);
    expect(new Set(reminders.map((r) => r.id)).size).toBe(2);
  });

  it("changes reminder identifiers when the due date changes", () => {
    const original = makePlan("p", "Shopee", "2026-11-16");
    const changed = makePlan("p", "Shopee", "2026-11-18");
    const originalInstallment = original.data.schedule[0];
    const changedInstallment = { ...changed.data.schedule[0], id: original.data.schedule[0]?.id ?? "" };
    if (!originalInstallment || !changedInstallment) throw new Error("fixture");
    expect(bnplReminderSchedule(changed, changedInstallment)[0]?.id).not.toBe(
      bnplReminderSchedule(original, originalInstallment)[0]?.id,
    );
  });

  it("rejects invalid dates and missing identifiers", () => {
    const plan = makePlan("p", "Shopee", "2026-11-16");
    expect(() => dueBnplReminders([plan], "2026-02-30", new Set())).toThrow(
      "valid calendar date",
    );
    const installment = plan.data.schedule[0];
    if (!installment) throw new Error("fixture");
    expect(() =>
      bnplReminderSchedule({ ...plan, id: " " }, installment),
    ).toThrow("identifiers are required");
  });
});
