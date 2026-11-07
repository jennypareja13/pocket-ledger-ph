import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, Empty, PageHeader, Panel, Stat } from "@/components/app/bits";
import { BnplPayDialog } from "@/components/app/bnpl-pay-dialog";
import { BnplPlanDialog } from "@/components/app/bnpl-plan-dialog";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { bnplView, type UpcomingItem } from "@/lib/bnpl-view";
import { formatDate, formatMonth, todayManila } from "@/lib/dates";
import { formatPHP } from "@/lib/money";

export const Route = createFileRoute("/_shell/bnpl")({
  head: () => ({
    meta: [
      { title: `Buy now, pay later — ${APP_NAME}` },
      { name: "description", content: "Track BNPL plans, monthly installments and what you still owe." },
      { property: "og:title", content: `Buy now, pay later — ${APP_NAME}` },
      { property: "og:description", content: "Track BNPL plans, monthly installments and what you still owe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BnplPage,
});

const STATUS: Record<UpcomingItem["status"], string> = {
  due_today: "Due today",
  upcoming: "Upcoming",
  past_due_unconfirmed: "Past due — not marked paid",
};

function BnplPage() {
  const { snap } = useApp();
  const { spaceId } = useSpace();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<UpcomingItem | null>(null);
  const v = bnplView(snap, spaceId ?? "", todayManila());

  if (!v.enabled)
    return (
      <>
        <PageHeader title="Buy now, pay later" />
        <Empty icon={<CalendarClock />} title="BNPL isn't available here">
          BNPL works only in a Main Space with it turned on. Switch to your Main Space, or turn it on in{" "}
          <Link to="/settings" className="underline">Settings</Link>.
        </Empty>
      </>
    );

  return (
    <>
      <PageHeader
        title="Buy now, pay later"
        subtitle={`Payments are only marked paid when you confirm them. ${formatMonth(v.month)}.`}
        actions={<Button onClick={() => setCreating(true)}><Plus /> New plan</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Unpaid this month" value={v.committed} hint={`${v.dueCount} installment(s)`} />
        <Stat label="Budget left this month" value={v.budget ? v.budget.remaining : 0} hint={v.budget ? `of ${formatPHP(v.budget.limit)}` : "No BNPL budget set"} />
        <Stat label="Still owed in total" value={v.outstanding} hint="All unpaid installments" />
      </div>
      {v.budget && (
        <Panel className="mb-4">
          <Bar pct={v.budget.pct} over={v.budget.over} />
          {v.budget.over ? (
            <p role="alert" className="mt-2 text-sm font-medium text-expense">This month's installments are over your BNPL budget by {formatPHP(-v.budget.remaining)}.</p>
          ) : v.budget.pct > 85 ? (
            <p className="mt-2 text-sm text-foreground">You're close to your BNPL budget for this month.</p>
          ) : null}
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming installments">
          {v.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid installments.</p>
          ) : (
            <ul className="divide-y">
              {v.upcoming.map((u) => (
                <li key={u.installment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.label} · {u.provider}</p>
                    <p className={u.status === "past_due_unconfirmed" ? "text-xs text-expense" : "text-xs text-muted-foreground"}>
                      {formatDate(u.installment.due_date)} · {STATUS[u.status]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-semibold">{formatPHP(u.installment.amount)}</span>
                    <Button size="sm" variant="outline" onClick={() => setPaying(u)}>Mark as paid</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Active plans">
          {v.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active plans yet. Add one with "New plan".</p>
          ) : (
            <ul className="space-y-4">
              {v.plans.map((p) => (
                <li key={p.plan.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="font-medium">{p.plan.data.label} · {p.plan.data.bnpl?.provider}</span>
                    <span className="num">{formatPHP(p.owed)} left</span>
                  </div>
                  <Bar pct={p.total ? Math.round((p.paidCount / p.total) * 100) : 0} />
                  <p className="mt-1 text-xs text-muted-foreground">{p.paidCount} of {p.total} paid</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <BnplPlanDialog open={creating} onOpenChange={setCreating} />
      <BnplPayDialog item={paying} onClose={() => setPaying(null)} />
    </>
  );
}
