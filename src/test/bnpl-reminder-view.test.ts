import { describe, expect, it } from "vitest";
import { bnplReminderView } from "@/lib/bnpl-view";
import type { Snapshot } from "@/lib/store";

const makeSnapshot = (options: {
  enabled?: boolean;
  spaceType?: "personal" | "managed";
  cancelled?: boolean;
  paidAmount?: number;
  paymentSpaceId?: string;
} = {}) =>
  ({
    spaces: [
      {
        id: "main",
        deleted: false,
        data: { type: options.spaceType ?? "personal", modules: { bnpl: options.enabled ?? true } },
      },
    ],
    loans: [
      {
        id: "plan-1",
        space_id: "main",
        deleted: false,
        data: {
          module: "bnpl",
          label: "Wireless earbuds",
          bnpl: {
            provider: "Shopee",
            cancelled: options.cancelled ?? false,
            schedule: [{ id: "installment-1", due_date: "2026-11-18", amount: 65000 }],
          },
        },
      },
    ],
    transactions:
      options.paidAmount === undefined
        ? []
        : [
            {
              id: "payment-1",
              space_id: options.paymentSpaceId ?? "main",
              deleted: false,
              data: {
                type: "bnpl_payment",
                installment_id: "installment-1",
                amount: options.paidAmount,
              },
            },
          ],
  }) as unknown as Snapshot;

describe("BNPL in-app reminder view", () => {
  it("shows the current D-7 reminder with plan, provider and remaining amount", () => {
    const reminders = bnplReminderView(makeSnapshot(), "main", "2026-11-11");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      label: "Wireless earbuds",
      provider: "Shopee",
      amountRemaining: 65000,
      paidAmount: 0,
      reminder: { daysBeforeDue: 7, dueDate: "2026-11-18", kind: "heads_up" },
    });
  });

  it("shows the due-day reminder on the installment due date", () => {
    const reminders = bnplReminderView(makeSnapshot(), "main", "2026-11-18");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.reminder.kind).toBe("due_day");
  });

  it("keeps a partially paid installment visible and shows its remaining amount", () => {
    const reminders = bnplReminderView(makeSnapshot({ paidAmount: 20000 }), "main", "2026-11-18");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ amountRemaining: 45000, paidAmount: 20000 });
  });

  it("suppresses a fully paid installment", () => {
    expect(
      bnplReminderView(makeSnapshot({ paidAmount: 65000 }), "main", "2026-11-18"),
    ).toEqual([]);
  });

  it("does not count a payment recorded in another space", () => {
    const reminders = bnplReminderView(
      makeSnapshot({ paidAmount: 65000, paymentSpaceId: "another-space" }),
      "main",
      "2026-11-18",
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.amountRemaining).toBe(65000);
  });

  it("suppresses reminders for cancelled plans", () => {
    expect(bnplReminderView(makeSnapshot({ cancelled: true }), "main", "2026-11-18")).toEqual([]);
  });

  it("suppresses reminders when BNPL is disabled", () => {
    expect(bnplReminderView(makeSnapshot({ enabled: false }), "main", "2026-11-18")).toEqual([]);
  });

  it("does not expose reminders in managed spaces", () => {
    expect(
      bnplReminderView(makeSnapshot({ spaceType: "managed" }), "main", "2026-11-18"),
    ).toEqual([]);
  });

  it("does not show reminders on dates without a scheduled occurrence", () => {
    expect(bnplReminderView(makeSnapshot(), "main", "2026-11-12")).toEqual([]);
  });
});
