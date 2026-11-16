import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { PlanTabs } from "@/components/app/PlanTabs";
import { Bar, Empty, PageHeader, Panel, Stat } from "@/components/app/bits";
import { BnplPlatformPayDialog } from "@/components/app/bnpl-platform-pay-dialog";
import { BnplPlanDialog } from "@/components/app/bnpl-plan-dialog";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { bnplView, type PlatformDueGroup } from "@/lib/bnpl-view";
import { formatMonth, todayManila } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { Card, CoinStack, Vault } from "@/components/app/illustrations";

export const Route = createFileRoute("/_shell/bnpl")({
  head: () => ({
    meta: [
      { title: `Buy now, pay later — ${APP_NAME}` },
      {
        name: "description",
        content: "Track BNPL plans, monthly installments and what you still owe.",
      },
      { property: "og:title", content: `Buy now, pay later — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Track BNPL plans, monthly installments and what you still owe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BnplPage,
});

function BnplPage() {
  const { snap } = useApp();
  const { spaceId } = useSpace();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<PlatformDueGroup | null>(null);
  const today = todayManila();
  const v = useMemo(() => bnplView(snap, spaceId ?? "", today), [snap, spaceId, today]);

  if (!v.enabled)
    return (
      <>
        <PlanTabs />
        <PageHeader title="Buy now, pay later" />
        <Empty
          icon={<CalendarClock />}
          illustration={<Vault className="size-14" />}
          title="BNPL isn't available here"
        >
          BNPL works only in a Main Space with it turned on. Switch to your Main Space, or turn it
          on in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </Empty>
      </>
    );

  return (
    <>
      <PlanTabs />
      <PageHeader
        title="Buy now, pay later"
        subtitle={`Payments are only marked paid when you confirm them. ${formatMonth(v.month)}.`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New plan
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Unpaid this month" value={v.committed} hint={`${v.dueCount} installment(s)`} />
        <Stat
          label="Budget left this month"
          value={v.budget ? v.budget.remaining : 0}
          hint={v.budget ? `of ${formatPHP(v.budget.limit)}` : "No BNPL budget set"}
        />
        <Stat label="Still owed in total" value={v.outstanding} hint="All unpaid installments" />
      </div>
      {v.budget && (
        <Panel className="mb-4">
          <Bar pct={v.budget.pct} over={v.budget.over} />
          {v.budget.over ? (
            <p role="alert" className="mt-2 text-sm font-medium text-expense">
              This month's installments are over your BNPL budget by{" "}
              {formatPHP(-v.budget.remaining)}.
            </p>
          ) : v.budget.pct > 85 ? (
            <p className="mt-2 text-sm text-foreground">
              You're close to your BNPL budget for this month.
            </p>
          ) : null}
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Platform payments">
          {v.platformGroups.length === 0 ? (
            <Empty
              icon={<CalendarClock />}
              illustration={<CoinStack className="size-14" />}
              title="No unpaid installments."
            />
          ) : (
            <ul className="divide-y">
              {v.platformGroups.map((group) => (
                <li key={group.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{group.provider}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMonth(group.month)} · {group.items.length} item(s) ·{" "}
                      {group.items.map((item) => item.label).join(", ")}
                    </p>
                    <p className="num mt-1 text-sm font-semibold">{formatPHP(group.total)} remaining</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPaying(group)}>
                    Review platform payment
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Active plans">
          {v.plans.length === 0 ? (
            <Empty
              icon={<CalendarClock />}
              illustration={<Card className="size-14" />}
              title={'No active plans yet. Add one with "New plan".'}
            />
          ) : (
            <ul className="space-y-4">
              {v.plans.map((p) => (
                <li key={p.plan.id}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {p.plan.data.label} · {p.plan.data.bnpl?.provider}
                    </span>
                    <span className="num">{formatPHP(p.owed)} left</span>
                  </div>
                  <Bar pct={p.total ? Math.round((p.paidCount / p.total) * 100) : 0} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.paidCount} of {p.total} paid
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <BnplPlanDialog open={creating} onOpenChange={setCreating} />
      <BnplPlatformPayDialog group={paying} onClose={() => setPaying(null)} />
    </>
  );
}
