import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, PageHeader, Panel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/config";
import { addMonths, currentMonth, formatMonth } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";
import { budgetRows } from "@/lib/selectors";
import { setBudget } from "@/lib/actions";

export const Route = createFileRoute("/_shell/budgets")({
  head: () => ({ meta: [
    { title: `Budgets — ${APP_NAME}` }, { name: "description", content: "Monthly budgets per expense category." },
    { property: "og:title", content: `Budgets — ${APP_NAME}` }, { property: "og:description", content: "Monthly budgets per expense category." },
  ] }),
  component: Budgets,
});

function Budgets() {
  const { store, snap } = useApp();
  const { spaceId, categories, budgets, transactions } = useSpace();
  const [month, setMonth] = useState(currentMonth());
  if (!spaceId) return null;
  const rows = budgetRows(spaceId, month, categories, budgets, transactions);
  return (
    <>
      <PageHeader title="Budgets" actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></Button>
          <span className="w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></Button>
        </div>} />
      <Panel>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.category.id + month} className="grid gap-2 py-3 sm:grid-cols-[1fr_160px] sm:items-center">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{r.category.data.name}</span>
                  <span className={r.over ? "num text-expense" : "num text-muted-foreground"}>
                    {formatPHP(r.spent)} spent{r.limit > 0 && ` · ${r.over ? "over by " + formatPHP(-r.remaining) : formatPHP(r.remaining) + " left"} · ${r.pct}%`}
                  </span>
                </div>
                <Bar pct={r.pct} over={r.over} />
              </div>
              <Input aria-label={`Budget for ${r.category.data.name}`} inputMode="decimal" placeholder="No budget" defaultValue={r.limit ? centsToInput(r.limit) : ""}
                onBlur={async (e) => {
                  const v = e.target.value.trim() ? parseAmount(e.target.value) : 0;
                  if (v === null || !store) return toast.error("Invalid amount");
                  if (v !== r.limit) { await setBudget(store, snap, spaceId, r.category.id, month, v); toast.success("Budget saved"); }
                }} />
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
