import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BNPL_MAX_MONTHS, budgetImpact, scheduleDates, type Installment } from "@/lib/bnpl";
import { createPlan } from "@/lib/bnpl-actions";
import { evenSplit } from "@/lib/bnpl-view";
import { formatMonth, todayManila } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";
import { bnplPaidIds, bnplPlans } from "@/lib/selectors";
import { cn } from "@/lib/utils";

const QUICK = [1, 3, 6, 12] as const;

export function BnplPlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { store, snap } = useApp();
  const { space, categories } = useSpace();
  const expenseCats = categories.filter((c) => !c.deleted && c.data.type === "expense" && !c.data.archived);
  const today = todayManila();
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [purchaseTotal, setPurchaseTotal] = useState("");
  const [note, setNote] = useState("");
  const [months, setMonths] = useState(3);
  const [custom, setCustom] = useState(false);
  const [firstDue, setFirstDue] = useState(today);
  const [dates, setDates] = useState<string[]>(() => scheduleDates(today, 3));
  const [amounts, setAmounts] = useState<string[]>(() => ["", "", ""]);
  const [split, setSplit] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  function resize(n: number, first = firstDue) {
    if (!Number.isSafeInteger(n) || n < 1 || n > BNPL_MAX_MONTHS) return;
    setMonths(n);
    setDates(scheduleDates(first, n));
    setAmounts((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
  }
  const parsed = amounts.map((a) => parseAmount(a));
  const total = parsed.reduce<number>((s, a) => s + (a ?? 0), 0);
  const plans = space ? bnplPlans(space.id, snap.spaces, snap.loans) : [];
  const limit = space?.data.bnpl_budget;
  const impact = useMemo(() => {
    if (typeof limit !== "number" || parsed.some((a) => a === null)) return [];
    const schedule = dates.map((d, i) => ({ id: String(i), due_date: d, amount: parsed[i] ?? 0 }));
    const like = plans.map((p) => ({ data: { schedule: p.data.bnpl?.schedule ?? [] } }));
    return budgetImpact(like, schedule, limit, bnplPaidIds(snap.transactions)).filter((m) => m.over);
  }, [limit, parsed, dates, plans, snap.transactions]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store || !space) return;
    setErr(undefined);
    if (parsed.some((a) => a === null || a === 0)) return setErr("Enter an amount above zero for every installment.");
    const pt = purchaseTotal.trim() ? parseAmount(purchaseTotal) : undefined;
    if (pt === null) return setErr("Enter a valid purchase price, or leave it empty.");
    const schedule: Installment[] = dates.map((d, i) => ({ id: crypto.randomUUID(), due_date: d, amount: parsed[i] ?? 0 }));
    setBusy(true);
    try {
      await createPlan(store, space.id, { description, provider, purchaseDate, categoryId, purchaseTotal: pt, schedule, note: note.trim() || undefined });
      toast.success("Plan saved");
      onOpenChange(false);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save the plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New BNPL plan</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="What did you buy?" htmlFor="bp-desc"><Input id="bp-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider" htmlFor="bp-prov"><Input id="bp-prov" value={provider} maxLength={100} placeholder="e.g. Atome" onChange={(e) => setProvider(e.target.value)} /></Field>
            <Field label="Purchase date" htmlFor="bp-date"><Input id="bp-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expense category" htmlFor="bp-cat">
              <Select id="bp-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Choose…</option>
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.data.name}</option>)}
              </Select>
            </Field>
            <Field label="Purchase price (optional)" htmlFor="bp-pt" hint="Anything above this counts as fees."><Input id="bp-pt" inputMode="decimal" value={purchaseTotal} onChange={(e) => setPurchaseTotal(e.target.value)} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Number of months</p>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((n) => (
                <Button key={n} type="button" size="sm" variant={!custom && months === n ? "default" : "outline"} onClick={() => { setCustom(false); resize(n); }}>{n}</Button>
              ))}
              <Button type="button" size="sm" variant={custom ? "default" : "outline"} onClick={() => setCustom(true)}>Custom</Button>
              {custom && <Input aria-label="Custom number of months" type="number" min={1} max={BNPL_MAX_MONTHS} className="w-24" value={months} onChange={(e) => resize(Number(e.target.value))} />}
            </div>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="First due date" htmlFor="bp-first"><Input id="bp-first" type="date" value={firstDue} onChange={(e) => { setFirstDue(e.target.value); if (e.target.value) setDates(scheduleDates(e.target.value, months)); }} /></Field>
            <div className="flex gap-2">
              <Input aria-label="Total to split evenly" inputMode="decimal" placeholder="Total" value={split} onChange={(e) => setSplit(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => { const t = parseAmount(split); if (t === null) return setErr("Enter a total to split."); setAmounts(evenSplit(t, months).map(centsToInput)); }}>Even split</Button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            {dates.map((d, i) => (
              <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                <Input aria-label={`Installment ${i + 1} due date`} type="date" value={d} onChange={(e) => setDates((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
                <Input aria-label={`Installment ${i + 1} amount`} inputMode="decimal" placeholder="0.00" value={amounts[i] ?? ""} className={cn(parsed[i] === null && amounts[i] && "border-destructive")} onChange={(e) => setAmounts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
              </div>
            ))}
            <p className="num text-right text-sm font-medium">Total {formatPHP(total)}</p>
          </div>
          {impact.length > 0 && (
            <p className="rounded-lg bg-warning/15 p-3 text-sm text-foreground">
              This goes over your BNPL budget in {impact.map((m) => formatMonth(m.month)).join(", ")}. You can still save it.
            </p>
          )}
          <Field label="Note (optional)" htmlFor="bp-note"><Input id="bp-note" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save plan"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
