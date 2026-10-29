import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Receipt, Search } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Empty, PageHeader, Panel, Select } from "@/components/app/bits";
import { TxRow } from "@/components/app/TxRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/config";
import { describeTx, personForTx, TX_TYPES } from "@/lib/labels";
import { formatDate } from "@/lib/dates";

export const Route = createFileRoute("/_shell/transactions")({
  head: () => ({
    meta: [
      { title: `Transactions — ${APP_NAME}` },
      { name: "description", content: "Search, filter and edit every income, expense, transfer and loan movement." },
      { property: "og:title", content: `Transactions — ${APP_NAME}` },
      { property: "og:description", content: "Search, filter and edit every income, expense, transfer and loan movement." },
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
  const [month, setMonth] = useState("");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return transactions.filter((t) => {
      const d = t.data;
      if (type && d.type !== type) return false;
      if (acc && d.account_id !== acc && d.to_account_id !== acc) return false;
      if (cat && d.category_id !== cat && d.fee_category_id !== cat) return false;
      if (month && !d.date.startsWith(month)) return false;
      if (needle) {
        const hay = `${describeTx(t, snap)} ${d.note ?? ""} ${personForTx(t, snap)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [transactions, q, type, acc, cat, month, snap]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((t) => m.set(t.data.date, [...(m.get(t.data.date) ?? []), t]));
    return [...m.entries()];
  }, [list]);

  return (
    <>
      <PageHeader title="Transactions" subtitle={space?.data.name} actions={<Button onClick={() => openTx()}><Plus /> Add</Button>} />
      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label htmlFor="tx-q" className="sr-only">Search</label>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="tx-q" placeholder="Search notes, people…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {TX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Select aria-label="Account" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.data.name}</option>)}
          </Select>
          <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.data.name} ({c.data.type})</option>)}
          </Select>
          <Input aria-label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </Panel>
      {transactions.length === 0 ? (
        <Empty icon={<Receipt />} title="No transactions in this space" action={<Button onClick={() => openTx()}>Add transaction</Button>} />
      ) : list.length === 0 ? (
        <Empty icon={<Search />} title="No matches">Try clearing a filter.</Empty>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{list.length} transaction(s)</p>
          {groups.map(([date, txs]) => (
            <Panel key={date} title={formatDate(date)}>
              <div className="-mx-2 -my-1">{txs.map((t) => <TxRow key={t.id} tx={t} />)}</div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
