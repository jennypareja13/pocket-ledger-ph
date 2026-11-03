import { BarChart3, PieChart as PieIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty, Panel } from "@/components/app/bits";
import { formatMonth } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { expenseBreakdown, monthlyTrend } from "@/lib/selectors";
import type { Category, Tx } from "@/lib/types";

const SLICE_COLORS = [
  "var(--brand-teal)",
  "var(--brand-ocean)",
  "var(--brand-aqua)",
  "var(--brand-deep)",
  "var(--brand-ice)",
];

const DOT_CLASSES = [
  "bg-[var(--brand-teal)]",
  "bg-[var(--brand-ocean)]",
  "bg-[var(--brand-aqua)]",
  "bg-[var(--brand-deep)]",
  "bg-[var(--brand-ice)]",
];

const shortMonth = (m: string) => formatMonth(m).split(" ")[0]?.slice(0, 3) ?? m;
const tooltipValue = (v: unknown) => (typeof v === "number" ? formatPHP(v) : String(v));

export function HomeCharts(props: {
  spaceId: string;
  month: string;
  txs: Tx[];
  categories: Category[];
}) {
  const { spaceId, month, txs, categories } = props;
  const trend = monthlyTrend(spaceId, txs, month).map((r) => ({
    ...r,
    label: shortMonth(r.month),
  }));
  const hasTrend = trend.some((r) => r.income > 0 || r.expense > 0);
  const slices = expenseBreakdown(spaceId, txs, month).map((s) => ({
    ...s,
    name:
      s.categoryId === "uncategorized"
        ? "Uncategorized"
        : (categories.find((c) => c.id === s.categoryId)?.data.name ?? "Unknown category"),
  }));
  const total = slices.reduce((a, s) => a + s.total, 0);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Panel title="Income vs expenses · last 6 months">
        {!hasTrend ? (
          <Empty icon={<BarChart3 />} title="No income or expenses yet">
            Transfers and loan amounts are not counted here.
          </Empty>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={48}
                  tickFormatter={(v: number) => `₱${Math.round(v / 100000)}k`}
                />
                <Tooltip formatter={tooltipValue} />
                <Bar
                  dataKey="income"
                  name="Income"
                  fill="var(--brand-teal)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name="Expenses"
                  fill="var(--brand-aqua)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title={`Spending by category · ${formatMonth(month)}`}>
        {slices.length === 0 ? (
          <Empty icon={<PieIcon />} title="No expenses this month" />
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="100%"
                    stroke="var(--card)"
                  >
                    {slices.map((s, i) => (
                      <Cell key={s.categoryId} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipValue} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="num text-sm font-semibold">{formatPHP(total)}</span>
              </div>
            </div>
            <ul className="w-full space-y-1.5 text-sm">
              {slices.slice(0, 6).map((s, i) => (
                <li key={s.categoryId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2.5 shrink-0 rounded-full border border-border ${DOT_CLASSES[i % DOT_CLASSES.length] ?? ""}`}
                    />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="num font-medium">{formatPHP(s.total)}</span>
                </li>
              ))}
              {slices.length > 6 && (
                <li className="text-xs text-muted-foreground">
                  +{slices.length - 6} more on Analysis
                </li>
              )}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
