import { describe, expect, it } from "vitest";
import {
  BNPL_REMINDER_OFFSETS,
  bnplReminderSchedule,
  dueBnplReminders,
  type ReminderInstallment,
} from "@/lib/bnpl-reminders";

const installment = (id: string, due_date: string) => ({ id, due_date, amount: 10_000 });
const item = (
  id: string,
  dueDate: string,
  options: { paid?: boolean; cancelled?: boolean } = {},
): ReminderInstallment => ({
  planId: "plan-1",
  installment: installment(id, dueDate),
  ...options,
});

describe("BNPL reminder schedule", () => {
  it("uses the separate D-7 heads-up, D-5 through D-1 countdown, and due day; no D-6", () => {
    const schedule = bnplReminderSchedule("plan-1", installment("inst-1", "2026-11-15"));
    expect(BNPL_REMINDER_OFFSETS).toEqual([7, 5, 4, 3, 2, 1, 0]);
    expect(schedule.map((r) => r.daysBeforeDue)).toEqual([7, 5, 4, 3, 2, 1, 0]);
    expect(schedule.map((r) => r.reminderDate)).toEqual([
      "2026-11-08",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(schedule[0]?.kind).toBe("heads_up");
    expect(schedule.slice(1, 6).every((r) => r.kind === "countdown")).toBe(true);
    expect(schedule.at(-1)?.kind).toBe("due_day");
  });

  it("returns the one-week heads-up on D-7 and nothing on D-6", () => {
    const entries = [item("i-1", "2026-11-15")];
    expect(dueBnplReminders(entries, "2026-11-08").map((r) => r.kind)).toEqual(["heads_up"]);
    expect(dueBnplReminders(entries, "2026-11-09")).toEqual([]);
  });

  it("returns each countdown reminder and the distinct due-day reminder only on its date", () => {
    const entries = [item("i-1", "2026-11-15")];
    for (const [date, offset] of [
      ["2026-11-10", 5],
      ["2026-11-11", 4],
      ["2026-11-12", 3],
      ["2026-11-13", 2],
      ["2026-11-14", 1],
      ["2026-11-15", 0],
    ] as const) {
      const reminders = dueBnplReminders(entries, date);
      expect(reminders.map((r) => r.daysBeforeDue)).toEqual([offset]);
      expect(reminders[0]?.kind).toBe(offset === 0 ? "due_day" : "countdown");
    }
  });

  it("handles month-end and year-end boundaries using calendar dates", () => {
    expect(
      bnplReminderSchedule("p", installment("feb", "2027-03-01")).map((r) => r.reminderDate),
    ).toEqual([
      "2027-02-22",
      "2027-02-24",
      "2027-02-25",
      "2027-02-26",
      "2027-02-27",
      "2027-02-28",
      "2027-03-01",
    ]);
    expect(
      bnplReminderSchedule("p", installment("new-year", "2027-01-01"))[0]?.reminderDate,
    ).toBe("2026-12-25");
  });

  it("handles leap day correctly", () => {
    expect(
      bnplReminderSchedule("p", installment("leap", "2028-03-01"))[0]?.reminderDate,
    ).toBe("2028-02-23");
    expect(
      bnplReminderSchedule("p", installment("leap", "2028-02-29")).at(-1)?.reminderDate,
    ).toBe("2028-02-29");
  });

  it("changes reminder dates and identifiers when the installment due date changes", () => {
    const before = bnplReminderSchedule("p", installment("i-1", "2026-11-16"));
    const after = bnplReminderSchedule("p", installment("i-1", "2026-11-18"));
    expect(after[0]?.reminderDate).toBe("2026-11-11");
    expect(after[0]?.id).not.toBe(before[0]?.id);
    expect(after.map((r) => r.id)).not.toEqual(before.map((r) => r.id));
  });

  it("returns only reminders due today and never replays missed reminders", () => {
    const entries = [item("i-1", "2026-11-15")];
    expect(dueBnplReminders(entries, "2026-11-10").map((r) => r.daysBeforeDue)).toEqual([5]);
    expect(dueBnplReminders(entries, "2026-11-09")).toEqual([]);
    expect(dueBnplReminders(entries, "2026-11-16")).toEqual([]);
  });

  it("suppresses paid and cancelled installments", () => {
    expect(
      dueBnplReminders(
        [
          item("paid", "2026-11-15", { paid: true }),
          item("cancelled", "2026-11-15", { cancelled: true }),
        ],
        "2026-11-08",
      ),
    ).toEqual([]);
  });

  it("returns no reminders while BNPL is disabled", () => {
    expect(dueBnplReminders([item("i-1", "2026-11-15")], "2026-11-08", false)).toEqual([]);
  });

  it("deduplicates repeated installment input and uses stable identifiers", () => {
    const entries = [item("i-1", "2026-11-15"), item("i-1", "2026-11-15")];
    const first = dueBnplReminders(entries, "2026-11-08");
    const second = dueBnplReminders(entries, "2026-11-08");
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it("keeps separate plans and installments independent", () => {
    const secondPlan: ReminderInstallment = {
      planId: "plan-2",
      installment: installment("i-1", "2026-11-15"),
    };
    const reminders = dueBnplReminders(
      [item("i-1", "2026-11-15"), secondPlan],
      "2026-11-08",
    );
    expect(reminders).toHaveLength(2);
    expect(reminders[0]?.id).not.toBe(reminders[1]?.id);
  });

  it("returns only the currently applicable reminder when a plan is created three days before due", () => {
    const entries = [item("i-1", "2026-11-15")];
    expect(dueBnplReminders(entries, "2026-11-12").map((r) => r.daysBeforeDue)).toEqual([3]);
  });

  it("rejects invalid due dates and current dates", () => {
    expect(() => bnplReminderSchedule("p", installment("i", "2026-02-30"))).toThrow(
      "valid calendar date",
    );
    expect(() => dueBnplReminders([item("i", "2026-11-15")], "2026-02-30")).toThrow(
      "valid calendar date",
    );
  });

  it("requires non-empty reminder identifiers", () => {
    expect(() => bnplReminderSchedule(" ", installment("i", "2026-11-15"))).toThrow(
      "identifiers are required",
    );
    expect(() => bnplReminderSchedule("p", installment(" ", "2026-11-15"))).toThrow(
      "identifiers are required",
    );
  });
});
