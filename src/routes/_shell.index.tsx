import { createFileRoute, Link } from "@tanstack/react-router";
import { HandCoins, PiggyBank, Receipt, Wallet } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, Empty, PageHeader, Panel, Stat } from "@/components/app/bits";
import { TxRow } from "@/components/app/TxRow";
import { SyncBadge } from "@/components/app/SyncBadge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { currentMonth, formatDate, formatMonth } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { accountBalance, budgetRows, homeSpaceOverview, loanOutstanding, ordinaryLoans, periodTotals, spaceCash, spaceReceivable } from "@/lib/selectors";
import { accountTypeLabel } from "@/lib/labels";

export const Route = createFileRoute("/_shell/")({
  head: () => ({
    meta: [
      { title: `Dashboard — ${APP_NAME}` },
      { name: "description", content: "Your balances, monthly cash flow, budgets and money owed to you at a glance." },
      { property: "og:title", content: `Dashboard — ${APP_NAME}` },
      { property: "og:description", content: "Your balances, monthly cash flow, budgets and money owed to you at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { snap, openTx } = useApp();
  const { space, spaceId, accounts, categories, transactions, budgets, loans } = useSpace();
  if (!space || !spaceId) return null;
  const month = currentMonth();
  const t = periodTotals(spaceId, snap.transactions, month);
  const cash = spaceCash(spaceId, snap.accounts, snap.transactions);
  const recv = spaceReceivable(spaceId, snap.loans, snap.transactions);
  const budget = budgetRows(spaceId, month, categories, budgets, transactions).filter((r) => r.limit > 0);
  const openLoans = ordinaryLoans(loans)
    .map((l) => ({ l, out: loanOutstanding(l.id, snap.transactions), who: snap.borrowers.find((b) => b.id === l.data.borrower_id)?.data.name }))
    .filter((x) => x.out > 0);
  const managed = homeSpaceOverview(spaceId, snap.spaces);
  const isManaged = space.data.type === "managed";

  return (
    <>
      <PageHeader title={space.data.name} subtitle={`${isManaged ? "Managed fund" : "Personal"} · ${formatMonth(month)}`} actions={<span className="md:hidden" />} />
      <div className="mb-4 hidden md:block"><SyncBadge /></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <Stat label={isManaged ? "Fund cash on hand" : "Available balance"} value={cash} hint={`${accounts.filter((a) => !a.data.archived).length} account(s)`} tone={isManaged ? "managed" : undefined} />
        </div>
        <Stat label="Owed to this space" value={recv} hint="Receivable, not cash" />
        <Stat label="Income this month" value={t.income} tone="income" />
        <Stat label="Expenses this month" value={t.expense} tone="expense" />
        <Stat label="Net cash flow" value={t.net} tone="net" hint="Excludes transfers & loans" />
      </div>

      {managed.length > 0 && (
        <Panel title="Managed funds - held for others" className="mt-4">
          <p className="mb-2 text-xs text-muted-foreground">Not your personal money and not included in your balance</p>
          {managed.map((s) => (
            <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.data.name}</span><span className="num font-medium">{formatPHP(spaceCash(s.id, snap.accounts, snap.transactions))}</span></div>
          ))}
        </Panel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Recent transactions" action={<Link to="/transactions" className="text-xs font-medium text-primary">See all</Link>}>
          {transactions.length === 0 ? (
            <Empty icon={<Receipt />} title="No transactions yet" action={<Button size="sm" onClick={() => openTx()}>Add your first</Button>}>
              Record income, expenses, transfers or loans. Everything saves on this device first.
            </Empty>
          ) : (
            <div className="-mx-2">{transactions.slice(0, 7).map((tx) => <TxRow key={tx.id} tx={tx} />)}</div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Accounts" action={<Link to="/accounts" className="text-xs font-medium text-primary">Manage</Link>}>
            {accounts.filter((a) => !a.data.archived).length === 0 ? (
              <Empty icon={<Wallet />} title="No accounts in this space" action={<Button asChild size="sm"><Link to="/accounts">Add account</Link></Button>} />
            ) : (
              <ul className="space-y-2">
                {accounts.filter((a) => !a.data.archived).map((a) => (
                  <li key={a.id} className="flex justify-between text-sm">
                    <span>{a.data.name} <span className="text-xs text-muted-foreground">· {accountTypeLabel(a.data.type)}</span></span>
                    <span className="num font-medium">{formatPHP(accountBalance(a.id, snap.transactions))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Budgets this month" action={<Link to="/budgets" className="text-xs font-medium text-primary">Edit</Link>}>
            {budget.length === 0 ? (
              <Empty icon={<PiggyBank />} title="No budgets set" action={<Button asChild size="sm" variant="outline"><Link to="/budgets">Set budgets</Link></Button>} />
            ) : (
              <ul className="space-y-3">
                {budget.slice(0, 5).map((r) => (
                  <li key={r.category.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{r.category.data.name}</span>
                      <span className={r.over ? "num font-medium text-expense" : "num text-muted-foreground"}>{formatPHP(r.spent)} / {formatPHP(r.limit)}</span>
                    </div>
                    <Bar pct={r.pct} over={r.over} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Money owed to me" action={<Link to="/loans" className="text-xs font-medium text-primary">Details</Link>}>
            {openLoans.length === 0 ? (
              <Empty icon={<HandCoins />} title="Nobody owes this space money" />
            ) : (
              <ul className="space-y-2">
                {openLoans.slice(0, 5).map(({ l, out, who }) => (
                  <li key={l.id} className="flex justify-between text-sm">
                    <span>{who}{l.data.due_date && <span className="text-xs text-muted-foreground"> · due {formatDate(l.data.due_date)}</span>}</span>
                    <span className="num font-medium">{formatPHP(out)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
