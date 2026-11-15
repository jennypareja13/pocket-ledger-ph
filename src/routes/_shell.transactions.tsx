import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Receipt, Search } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Empty, PageHeader, Panel, Select, Stat } from "@/components/app/bits";
import { PeriodFilter } from "@/components/app/PeriodFilter";
import { TxRow } from "@/components/app/TxRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/config";
import { describeTx, personForTx, TX_TYPES } from "@/lib/labels";
import { toast } from "sonner";
import { downloadFile, exportSpaceCsv } from "@/lib/csv";
import {
  formatDate,
  formatPeriodLabel,
  periodDateRange,
  todayManila,
  type DatePeriod,
} from "@/lib/dates";
import { periodTotalsBetween } from "@/lib/period-totals";
import { Card } from "@/components/app/illustrations";

export const Route = createFileRoute("/_shell/transactions")({
  head: () => ({
    meta: [
      { title: `Activity — ${APP_NAME}` },
      {
        name: "description",
        content: "Review transactions and income and expense insights for a selected period.",
      },
      { property: "og:title", content: `Activity — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Review transactions and income and expense insights for a selected period.",
      },
    ],
  }),
  component: Transactions,
});

function Transactions() {
  const { snap, openTx } = useApp();
  const { space, accounts, categories, transactions } = useSpace();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [acc, setAcc] = useState("");
  const [cat, setCat] = useState("");
  const [period, setPeriod] = useState<DatePeriod>("month");
  const [anchor, setAnchor] = useState(todayManila());
  const range = periodDateRange(period, anchor);
  const periodLabel = formatPeriodLabel(period, anchor);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
  }, [range.from, range.to]);

  const insights = periodTotalsBetween(space?.id ?? "", transactions, range.from, range.to);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      const d = t.data;
      if (type && d.type !== type) return false;
      if (acc && d.account_id !== acc && d.to_account_id !== acc) return false;
      if (cat && d.category_id !== cat && d.fee_category_id !== cat) return false;
      if (d.date < range.from || d.date > range.to) return false;
      if (needle) {
        const hay = `${describeTx(t, snap)} ${d.note ?? ""} ${personForTx(t, snap)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, q, type, acc, cat, range.from, range.to, snap]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((t) => m.set(t.data.date, [...(m.get(t.data.date) ?? []), t]));
    return [...m.entries()];
  }, [list]);

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle={space?.data.name}
        actions={
          <Button onClick={() => openTx()}>
            <Plus /> Add
          </Button>
        }
      />
      <div className="mb-4">
        <PeriodFilter
          period={period}
          anchor={anchor}
          onPeriodChange={setPeriod}
          onAnchorChange={setAnchor}
        />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Activity insights">
        <Stat label="Income" value={insights.income} tone="income" hint={periodLabel} />
        <Stat label="Expenses" value={insights.expense} tone="expense" hint={periodLabel} />
        <Stat
          label="Net cash flow"
          value={insights.net}
          tone="net"
          hint="Reportable entries only"
        />
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          From
          <Input
            aria-label="CSV from date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          To
          <Input
            aria-label="CSV to date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          onClick={() => {
            if (!space) return;
            try {
              const csv = exportSpaceCsv(snap, space, from, to);
              downloadFile(csv.filename, csv.body, "text/csv;charset=utf-8");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not export.");
            }
          }}
        >
          <Download />
          Download CSV
        </Button>
      </div>
      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor="tx-q" className="sr-only">
              Search
            </label>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tx-q"
              placeholder="Search notes, people…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {TX_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Account" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.data.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.data.name} ({c.data.type})
              </option>
            ))}
          </Select>
        </div>
      </Panel>
      {transactions.length === 0 ? (
        <Empty
          icon={<Receipt />}
          illustration={<Card className="size-14" />}
          title="No transactions in this space"
          action={<Button onClick={() => openTx()}>Add transaction</Button>}
        />
      ) : list.length === 0 ? (
        <Empty icon={<Search />} illustration={<Card className="size-14" />} title="No matches">
          Try clearing a filter.
        </Empty>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{list.length} transaction(s)</p>
          {groups.map(([date, txs]) => (
            <Panel key={date} title={formatDate(date)}>
              <div className="-mx-2 -my-1">
                {txs.map((t) => (
                  <TxRow key={t.id} tx={t} />
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
