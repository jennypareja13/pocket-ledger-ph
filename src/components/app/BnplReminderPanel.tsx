import { Link } from "@tanstack/react-router";
import { Panel } from "@/components/app/bits";
import { useApp } from "@/components/app/AppProvider";
import { bnplReminderView } from "@/lib/bnpl-view";
import { formatDate, todayManila } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

function reminderLabel(daysBeforeDue: number): string {
  if (daysBeforeDue === 7) return "Due in one week";
  if (daysBeforeDue === 1) return "Due tomorrow";
  if (daysBeforeDue === 0) return "Due today";
  return `Due in ${daysBeforeDue} days`;
}

function reminderMessage(daysBeforeDue: number): string {
  if (daysBeforeDue === 7) return "Your payment is due in one week.";
  if (daysBeforeDue === 1) return "Your payment is due tomorrow.";
  if (daysBeforeDue === 0) return "Your payment is due today.";
  return `${daysBeforeDue} days until your payment is due.`;
}

export function BnplReminderPanel({
  spaceId,
  compact = false,
}: {
  spaceId: string;
  compact?: boolean;
}) {
  const { snap } = useApp();
  const reminders = bnplReminderView(snap, spaceId, todayManila());
  if (reminders.length === 0) return null;

  return (
    <Panel
      title="Upcoming BNPL payments"
      action={
        <Link to="/bnpl" className="text-xs font-medium text-primary">
          View BNPL
        </Link>
      }
      className={compact ? "mt-4" : "mb-4"}
    >
      <ul className={compact ? "space-y-2" : "space-y-3"}>
        {reminders.map(({ reminder, label, provider, amountRemaining, paidAmount }) => (
          <li
            key={reminder.id}
            className={
              compact
                ? "rounded-xl bg-muted/45 p-3"
                : "rounded-xl border border-border/70 p-4"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {provider ? `${provider} · ` : ""}Due {formatDate(reminder.dueDate)}
                </p>
              </div>
              <span
                className={
                  reminder.daysBeforeDue === 0
                    ? "rounded-full bg-expense/10 px-2.5 py-1 text-xs font-medium text-expense"
                    : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                }
              >
                {reminderLabel(reminder.daysBeforeDue)}
              </span>
            </div>
            <p className="num mt-2 text-lg font-semibold">
              {formatPHP(amountRemaining)} remaining
            </p>
            {paidAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatPHP(paidAmount)} already paid
              </p>
            )}
            {!compact && (
              <p className="mt-2 text-sm text-muted-foreground">
                {reminderMessage(reminder.daysBeforeDue)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
