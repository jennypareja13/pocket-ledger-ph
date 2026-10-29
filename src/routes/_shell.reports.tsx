import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, PageHeader, Panel, Select, Stat } from "@/components/app/bits";
import { APP_NAME } from "@/lib/config";
import { currentMonth } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { accountBalance, loanOutstanding, periodTotals, spaceCash, spaceReceivable } from "@/lib/selectors";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_shell/reports")({
  head: () => ({ meta: [
    { title: `Reports — ${APP_NAME}` }, { name: "description", content: "Monthly and yearly income, expenses, categories and balances." },
    { property: "og:title", content: `Reports — ${APP_NAME}` }, { property: "og:description", content: "Monthly and yearly income and expense reports." },
  ] }),
  component: Reports,
});

function Reports() {
  const { snap } = useApp();
  const { spaceId, accounts, loans } = useSpace();
  const [mode, setMode] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(currentMonth());
  if (!spaceId) return null;
  const prefix = mode === "month" ? month : month.slice(0, 4);
  const t = periodTotals(spaceId, snap.transactions, prefix);
  const cats = [...t.byCategory.entries()].sort((a, b) => b[1].total - a[1].total);
  const max = Math.max(1, ...cats.map((c) => c[1].total));
  const months = Array.from({ length: 12 }, (_, i) => `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`);
  return (
    <>
      <PageHeader title="Reports" subtitle="Transfers and loan principal are excluded; fees count as expenses." actions={
        <div className="flex gap-2">
          <Select aria-label="Period" value={mode} onChange={(e) => setMode(e.target.value as "month" | "year")} className="w-28"><option value="month">Month</option><option value="year">Year</option></Select>
          <Input aria-label="Month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
        </div>} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Income" value={t.income} tone="income" />
        <Stat label="Expenses" value={t.expense} tone="expense" />
        <Stat label="Net" value={t.net} tone="net" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By category">
          {cats.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded.</p> : cats.map(([id, c]) => (
            <div key={id} className="mb-2">
              <div className="flex justify-between text-sm"><span>{snap.categories.find((x) => x.id === id)?.data.name ?? "Uncategorized"} <span className="text-xs text-muted-foreground">{c.type}</span></span><span className="num">{formatPHP(c.total)}</span></div>
              <Bar pct={Math.round((c.total / max) * 100)} />
            </div>
          ))}
        </Panel>
        {mode === "year" && (
          <Panel title="Cash flow by month">
            {months.map((m) => { const p = periodTotals(spaceId, snap.transactions, m); return (
              <div key={m} className="flex justify-between border-b py-1 text-sm num"><span>{m}</span><span className="text-income">+{formatPHP(p.income)}</span><span className="text-expense">−{formatPHP(p.expense)}</span></div>); })}
          </Panel>
        )}
        <Panel title="Account balances">
          {accounts.map((a) => <div key={a.id} className="flex justify-between py-1 text-sm"><span>{a.data.name}</span><span className="num">{formatPHP(accountBalance(a.id, snap.transactions))}</span></div>)}
        </Panel>
        <Panel title="Loans outstanding (this space)">
          {loans.map((l) => <div key={l.id} className="flex justify-between py-1 text-sm"><span>{snap.borrowers.find((b) => b.id === l.data.borrower_id)?.data.name}</span><span className="num">{formatPHP(loanOutstanding(l.id, snap.transactions))}</span></div>)}
        </Panel>
        <Panel title="Managed fund balances">
          {snap.spaces.filter((s) => s.data.type === "managed").map((s) => (
            <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.data.name}</span><span className="num">{formatPHP(spaceCash(s.id, snap.accounts, snap.transactions))} cash · {formatPHP(spaceReceivable(s.id, snap.loans, snap.transactions))} owed</span></div>
          ))}
        </Panel>
      </div>
    </>
  );
}
