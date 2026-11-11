# BNPL payment reminders and countdown

## Calendar and timezone
- Interpret installment due dates as calendar dates in the app's configured Asia/Manila timezone.
- The Analysis and transaction week is Monday through Sunday.

## Reminder schedule
For each unpaid installment with due date D, schedule:
- D-7: a one-week-ahead heads-up reminder. This is separate from the countdown.
- D-5: begin the countdown. The message must clearly communicate that the payment countdown has started and show the remaining days.
- D-4, D-3, D-2, and D-1: one reminder per day, with the remaining-days countdown.
- D: a due-today reminder that feels timely and action-oriented, clearly stating that payment is due today.

Do not send the D-7 heads-up as part of the five-day countdown. The countdown begins exactly five calendar days before the due date.

## Stop conditions and rescheduling
- If the installment is paid before any scheduled reminder, cancel all remaining reminders for that installment immediately.
- If paid on the due date, no additional due-today reminder should be sent after the payment is recorded.
- If the due date changes, cancel the old schedule and generate the correct new schedule, avoiding duplicate notifications.
- If an installment is deleted, voided, or its BNPL plan is removed, cancel its pending reminders.
- If BNPL reminders are disabled, stop future reminders without deleting payment records. Re-enabling reminders should schedule only still-unpaid installments whose reminder dates have not passed; do not send a backlog of missed reminders.
- Grouped provider payments must cancel reminders for each installment successfully marked paid; unrelated or unpaid installments retain their own schedules.

## Delivery and reliability
- Use idempotent reminder identifiers keyed by installment and reminder offset (for example, D-7, D-5, D-4 ... D).
- Re-check payment state immediately before delivery to avoid a notification racing with a payment.
- Do not promise guaranteed delivery. Explain permission and platform constraints for browser/PWA notifications.
- Avoid duplicate delivery across app refreshes, multiple devices, sync retries, or service-worker restarts.
- If a notification cannot be delivered, retain an in-app upcoming/due state where feasible.

## User-facing copy and presentation
- D-7: a calm advance heads-up that payment is due in one week.
- D-5 through D-1: a clear countdown that starts at five days and decreases daily.
- D: a distinct due-today reminder, not another generic countdown message.
- Messages should be concise, neutral, non-shaming, and include provider/plan context, exact amount, and due date where available.
- Do not imply a payment has been made or mark an installment paid automatically.

## Acceptance tests
1. A future unpaid installment gets exactly one D-7 heads-up and countdown reminders at D-5, D-4, D-3, D-2, D-1, and D.
2. No D-6 reminder is scheduled.
3. Paying before a reminder cancels every remaining reminder for that installment.
4. Paying on D prevents a later D notification.
5. Editing the due date replaces the old schedule without duplicates.
6. Duplicate scheduler runs and sync retries do not create duplicate notifications.
7. Grouped payments cancel reminders only for installments marked paid.
8. Reminder disable/enable does not erase ledger data or send a backlog of missed reminders.
9. Calendar calculations behave correctly across month/year boundaries and use Asia/Manila dates.
