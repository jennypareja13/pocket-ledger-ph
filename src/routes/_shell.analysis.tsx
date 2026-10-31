import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BarChart, Bar as ChartBar, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined } from "lucide-react";
import { useSpace } from "@/components/app/AppProvider";
import { Empty, PageHeader, Panel, Select, Stat, Bar } from "@/components/app/bits";
import { APP_NAME } from "@/lib/config";
import { addMonths, currentMonth, formatMonth } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { periodTotals } from "@/lib/selectors";
import { Input } from "@/components/ui/input";
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export const Route = createFileRoute("/_shell/analysis")({ head: () => ({ meta: [
  { title: `Analysis — ${APP_NAME}` }, { name: "description", content: "Spending patterns, category shares and monthly income versus expenses." },
  { property: "og:title", content: `Analysis — ${APP_NAME}` }, { property: "og:description", content: "Spending patterns, category shares and monthly income versus expenses." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), component: Analysis });
function Analysis() {
  const { spaceId, space, categories, transactions } = useSpace();
  const [mode, setMode] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(currentMonth());
  if (!spaceId) return null;
  if (space?.data.purpose) return <PageHeader title="Analysis" subtitle="Reimbursement claims and payments are shown in Reimbursements, separate from spending." />;
  const prefix = mode === "month" ? month : month.slice(0, 4);
  const totals = periodTotals(spaceId, transactions, prefix);
  const cats = [...totals.byCategory.entries()].filter(([, c]) => c.type === "expense").sort((a, b) => b[1].total - a[1].total).map(([id, c]) => ({ name: categories.find((x) => x.id === id)?.data.name ?? "Uncategorized", value: c.total }));
  const months = mode === "year" ? Array.from({ length: 12 }, (_, i) => `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`) : Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const trend = months.map((m) => { const t = periodTotals(spaceId, transactions, m); return { name: formatMonth(m), income: t.income, expense: t.expense }; });
  return <><PageHeader title="Analysis" subtitle={`${space?.data.name} · ${mode === "year" ? prefix : formatMonth(month)}`} actions={<><Select aria-label="Analysis period" className="w-28" value={mode} onChange={(e) => setMode(e.target.value as "month" | "year")}><option value="month">Month</option><option value="year">Year</option></Select><Input aria-label="Analysis month" type="month" className="w-40" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></>} />
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Income" value={totals.income} /><Stat label="Expenses" value={totals.expense} /><Stat label="Net cash flow" value={totals.net} tone="net" />{totals.income > 0 && <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Savings rate</p><p className="num mt-2 text-2xl font-semibold">{((totals.net / totals.income) * 100).toFixed(1)}%</p></div>}</div>
  {totals.expense === 0 && totals.income === 0 ? <div className="mt-6"><Empty icon={<ChartNoAxesCombined />} title="No spending or income in this period" /></div> : <div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Expense shares">{cats.length ? <><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={cats} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} isAnimationActive={false}>{cats.map((c, i) => <Cell key={c.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => formatPHP(v)} /></PieChart></ResponsiveContainer></div><ul className="space-y-2">{cats.map((c, i) => <li key={c.name} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"][i % 5]}`} />{c.name}</span><span className="num font-medium">{formatPHP(c.value)}</span></li>)}</ul></> : <p className="text-sm text-muted-foreground">No expenses this period.</p>}</Panel><Panel title={mode === "year" ? `Monthly trend · ${prefix}` : `Six-month trend ending ${formatMonth(month)}`}><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" tick={{ fill: "var(--foreground)", fontSize: 10 }} /><YAxis tickFormatter={(v: number) => `₱${Math.round(v / 100)}`} width={65} tick={{ fill: "var(--foreground)", fontSize: 10 }} /><Tooltip formatter={(v: number) => formatPHP(v)} /><ChartBar dataKey="income" name="Income" fill="var(--chart-1)" isAnimationActive={false} /><ChartBar dataKey="expense" name="Expenses" fill="var(--chart-2)" isAnimationActive={false} /></BarChart></ResponsiveContainer></div><div className="flex justify-center gap-5 text-xs"><span className="flex items-center gap-2"><span className="size-3 bg-chart-1" />Income</span><span className="flex items-center gap-2"><span className="size-3 bg-chart-2" />Expenses</span></div></Panel><Panel title="Top expense categories" className="lg:col-span-2">{cats.map((c, i) => <div key={c.name} className="mb-4"><div className="mb-2 flex justify-between gap-3 text-sm"><span>{i + 1}. {c.name}</span><span className="num font-medium">{formatPHP(c.value)} · {((c.value / totals.expense) * 100).toFixed(1)}%</span></div><Bar pct={(c.value / totals.expense) * 100} /></div>)}</Panel></div>}</>;
}
