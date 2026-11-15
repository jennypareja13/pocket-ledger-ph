import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, Empty, Field, PageHeader, Panel, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/config";
import { addMonths, currentMonth, formatMonth } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";
import { bnplEnabled } from "@/lib/bnpl-actions";
import { budgetRows, mainSpaces } from "@/lib/selectors";
import { saveCustomBudget } from "@/lib/module-actions";
import { setBnplBudget } from "@/lib/bnpl-actions";
import type { Budget } from "@/lib/types";

export const Route = createFileRoute("/_shell/budgets")({
  head: () => ({
    meta: [
      { title: `Budgets — ${APP_NAME}` },
      { name: "description", content: "Your monthly budgets and category spending." },
      { property: "og:title", content: `Budgets — ${APP_NAME}` },
      { property: "og:description", content: "Your monthly budgets and category spending." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Budgets,
});
function Budgets() {
  const { store, snap } = useApp();
  const { spaceId, space, categories, budgets, transactions } = useSpace();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string>();
  const [category, setCategory] = useState("");
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState("");
  const [budgetMonth, setBudgetMonth] = useState(month);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bnplDraft, setBnplDraft] = useState<{ spaceId: string; value: string }>({
    spaceId: "",
    value: "",
  });
  const [bnplBusy, setBnplBusy] = useState(false);
  const isMainSpace = !!space && mainSpaces(snap.spaces).some((item) => item.id === space.id);
  const bnplBudget = space?.data.bnpl_budget;
  const bnplAmount =
    bnplDraft.spaceId === space?.id
      ? bnplDraft.value
      : typeof bnplBudget === "number"
        ? centsToInput(bnplBudget)
        : "";

  async function submitBnplBudget(e: FormEvent) {
    e.preventDefault();
    if (!store || !space || !isMainSpace) return;
    const value = parseAmount(bnplAmount);
    if (value === null) {
      toast.error("Enter a valid BNPL budget amount.");
      return;
    }
    setBnplBusy(true);
    try {
      await setBnplBudget(store, space.id, value);
      setBnplDraft({ spaceId: space.id, value: centsToInput(value) });
      toast.success("BNPL budget saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the BNPL budget.");
    } finally {
      setBnplBusy(false);
    }
  }

  async function removeBnplBudget() {
    if (!store || !space || !isMainSpace) return;
    setBnplBusy(true);
    try {
      await setBnplBudget(store, space.id, null);
      setBnplDraft({ spaceId: space.id, value: "" });
      toast.success("BNPL budget removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the BNPL budget.");
    } finally {
      setBnplBusy(false);
    }
  }

  const start = (b?: Budget) => {
    setEditId(b?.id);
    setCategory(b?.data.category_id ?? "");
    setCustom("");
    setAmount(b ? centsToInput(b.data.amount) : "");
    setBudgetMonth(b?.data.month ?? month);
    setError("");
    setOpen(true);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store || !spaceId) return;
    const value = parseAmount(amount);
    if (value === null) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      await saveCustomBudget(
        store,
        spaceId,
        category,
        category === "new" ? custom : "",
        budgetMonth,
        value,
        editId,
      );
      setMonth(budgetMonth);
      setOpen(false);
      toast.success("Budget saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!spaceId) return null;
  const rows = budgetRows(spaceId, month, categories, budgets, transactions);
  return (
    <>
      <PageHeader
        title="Budgets"
        subtitle={space?.data.name}
        actions={
          <Button onClick={() => start()}>
            <Plus />
            Create budget
          </Button>
        }
      />
      {isMainSpace && space && (
        <Panel title="BNPL monthly budget" className="mb-6">
          <p className="text-sm text-muted-foreground">
            Set one monthly limit shared by all BNPL providers. This budget is separate from
            category budgets.
            {!bnplEnabled(snap, space.id) &&
              " BNPL tracking is currently off in Settings; this limit is retained until it is enabled again."}
          </p>
          <form onSubmit={submitBnplBudget} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Field label="Monthly limit (₱)" htmlFor="bnpl-budget-amount">
                <Input
                  id="bnpl-budget-amount"
                  inputMode="decimal"
                  value={bnplAmount}
                  onChange={(event) =>
                    setBnplDraft({ spaceId: space.id, value: event.target.value })
                  }
                  placeholder="e.g. 5000"
                  required
                />
              </Field>
            </div>
            <Button type="submit" disabled={bnplBusy}>
              {bnplBusy ? "Saving…" : "Save BNPL budget"}
            </Button>
            {typeof bnplBudget === "number" && (
              <Button
                type="button"
                variant="outline"
                disabled={bnplBusy}
                onClick={removeBnplBudget}
              >
                Remove budget
              </Button>
            )}
          </form>
        </Panel>
      )}
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="w-40 text-center text-sm font-semibold">{formatMonth(month)}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {rows.length === 0 ? (
        <Empty
          icon={<PiggyBank />}
          title="No budgets this month"
          action={<Button onClick={() => start()}>Create budget</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((r) => (
            <Panel
              key={r.category.id}
              title={r.category.data.name}
              action={
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${r.category.data.name} budget`}
                    onClick={() => start(r.budget)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${r.category.data.name} budget`}
                    onClick={async () => {
                      if (
                        store &&
                        r.budget &&
                        confirm(
                          "Delete this budget? Category and transaction history stay unchanged.",
                        )
                      )
                        await store.remove([r.budget.id]);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              }
            >
              <p className="num mb-3 text-2xl font-semibold">
                {formatPHP(r.spent)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  of {formatPHP(r.limit)}
                </span>
              </p>
              <Bar pct={r.pct} over={r.over} />
              <div className="mt-3 flex justify-between text-sm">
                <span>
                  {r.over ? "Over budget" : "Remaining"}:{" "}
                  <span className="num font-medium">{formatPHP(Math.abs(r.remaining))}</span>
                </span>
                <span className="num">{r.pct}%</span>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit budget" : "Create budget"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Expense category" htmlFor="budget-category">
              <Select
                id="budget-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="">Choose category</option>
                {categories
                  .filter((c) => c.data.type === "expense" && !c.data.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.data.name}
                    </option>
                  ))}
                <option value="new">Create custom category</option>
              </Select>
            </Field>
            {category === "new" && (
              <Field label="New category name" htmlFor="budget-custom">
                <Input
                  id="budget-custom"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  required
                />
              </Field>
            )}
            <Field label="Budget amount (₱)" htmlFor="budget-amount">
              <Input
                id="budget-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Month" htmlFor="budget-month">
              <Input
                id="budget-month"
                type="month"
                value={budgetMonth}
                onChange={(e) => setBudgetMonth(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save budget"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
