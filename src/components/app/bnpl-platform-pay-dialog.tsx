import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recordPlatformPayment } from "@/lib/bnpl-actions";
import type { PlatformDueGroup } from "@/lib/bnpl-view";
import { formatMonth, todayManila } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";

type Allocation = { principal: string; fee: string };

export function BnplPlatformPayDialog({
  group,
  onClose,
}: {
  group: PlatformDueGroup | null;
  onClose: () => void;
}) {
  const { store } = useApp();
  const { space, accounts } = useSpace();
  const active = accounts.filter((a) => !a.deleted && !a.data.archived);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayManila());
  const [actual, setActual] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, Allocation>>({});
  const [reviewing, setReviewing] = useState(false);
  const [confirmedMismatch, setConfirmedMismatch] = useState(false);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => group?.items.filter((item) => selected.includes(item.installment.id)) ?? [], [group, selected]);
  const scheduled = items.reduce((sum, item) => sum + item.installment.amount, 0);
  const actualCents = parseAmount(actual);
  const allocated = items.reduce((sum, item) => {
    const row = allocations[item.installment.id];
    return sum + (parseAmount(row?.principal ?? "") ?? 0) + (parseAmount(row?.fee ?? "") ?? 0);
  }, 0);

  useEffect(() => {
    if (!group) return;
    setSelected(group.items.map((item) => item.installment.id));
    setActual(centsToInput(group.total));
    setDate(todayManila());
    setAccountId("");
    setAllocations({});
    setReviewing(false);
    setConfirmedMismatch(false);
    setErr(undefined);
  }, [group]);

  function makeDefaultAllocations(total: number, selectedItems: typeof items) {
    let left = total;
    const next: Record<string, Allocation> = {};
    selectedItems.forEach((item, index) => {
      const amount = Math.min(item.installment.amount, Math.max(0, left));
      left -= amount;
      const fee = index === 0 && left > 0 ? left : 0;
      if (fee) left -= fee;
      next[item.installment.id] = { principal: centsToInput(amount), fee: centsToInput(fee) };
    });
    return next;
  }

  function review(e: FormEvent) {
    e.preventDefault();
    if (!items.length) return setErr("Select at least one item.");
    if (actualCents === null || actualCents <= 0) return setErr("Enter the exact amount you paid.");
    if (!accountId) return setErr("Choose the account used for this payment.");
    setAllocations(makeDefaultAllocations(actualCents, items));
    setConfirmedMismatch(actualCents !== scheduled);
    setReviewing(true);
    setErr(undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store || !space || !group || actualCents === null) return;
    if (allocated !== actualCents) return setErr("Item allocations must add up exactly to the actual amount paid.");
    const rows = items.map((item) => ({
      planId: item.planId,
      installmentId: item.installment.id,
      principal: parseAmount(allocations[item.installment.id]?.principal ?? "") ?? 0,
      fee: parseAmount(allocations[item.installment.id]?.fee ?? "") ?? 0,
    }));
    setBusy(true);
    try {
      await recordPlatformPayment(store, space.id, { accountId, date, allocations: rows, actualTotal: actualCents });
      toast.success("Platform payment recorded");
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save the payment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateAllocation(id: string, key: keyof Allocation, value: string) {
    setAllocations((current) => ({
      ...current,
      [id]: { principal: current[id]?.principal ?? "0.00", fee: current[id]?.fee ?? "0.00", [key]: value },
    }));
  }

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{group?.provider} payment · {group ? formatMonth(group.month) : ""}</DialogTitle>
        </DialogHeader>
        {group && !reviewing && (
          <form onSubmit={review} className="space-y-4">
            <p className="text-sm text-muted-foreground">Select the purchases covered by this platform payment.</p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {group.items.map((item) => (
                <label key={item.installment.id} className="flex items-start gap-2 rounded-md border p-3">
                  <input type="checkbox" checked={selected.includes(item.installment.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, item.installment.id] : current.filter((id) => id !== item.installment.id))} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{item.label}</span>
                    <span className="block text-muted-foreground">Due {item.installment.due_date}</span>
                  </span>
                  <span className="num text-sm font-semibold">{formatPHP(item.installment.amount)}</span>
                </label>
              ))}
            </div>
            <Field label="Paid from" htmlFor="platform-pay-account">
              <Select id="platform-pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Choose an account…</option>
                {active.map((account) => <option key={account.id} value={account.id}>{account.data.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment date" htmlFor="platform-pay-date">
                <Input id="platform-pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Actual amount paid" htmlFor="platform-pay-actual" hint="Calculated from selected items. You can edit it.">
                <Input id="platform-pay-actual" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} />
              </Field>
            </div>
            <p className="text-sm">Selected installment total: <strong>{formatPHP(scheduled)}</strong></p>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>Review payment</Button>
          </form>
        )}
        {group && reviewing && (
          <form onSubmit={submit} className="space-y-4">
            {confirmedMismatch && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4" /> Amount mismatch</p>
                <p className="mt-1">Selected installments: {formatPHP(scheduled)} · Actual paid: {actualCents === null ? "—" : formatPHP(actualCents)}.</p>
                <p className="mt-1">Are these correct? Confirm a partial payment or extra fees, or go back and recheck.</p>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setReviewing(false)}>No, let me recheck</Button>
              </div>
            )}
            <p className="text-sm font-medium">Allocate the actual payment to each item.</p>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.installment.id} className="grid grid-cols-2 gap-3 rounded-md border p-3">
                  <div className="col-span-2 text-sm font-medium">{item.label} · remaining {formatPHP(item.installment.amount)}</div>
                  <Field label="Applied to installment" htmlFor={`alloc-${item.installment.id}`}>
                    <Input id={`alloc-${item.installment.id}`} inputMode="decimal" value={allocations[item.installment.id]?.principal ?? ""} onChange={(e) => updateAllocation(item.installment.id, "principal", e.target.value)} />
                  </Field>
                  <Field label="Extra fee" htmlFor={`fee-${item.installment.id}`}>
                    <Input id={`fee-${item.installment.id}`} inputMode="decimal" value={allocations[item.installment.id]?.fee ?? "0.00"} onChange={(e) => updateAllocation(item.installment.id, "fee", e.target.value)} />
                  </Field>
                </div>
              ))}
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Allocated</span><strong>{formatPHP(allocated)}</strong></div>
              <div className="flex justify-between"><span>Actual payment</span><strong>{actualCents === null ? "—" : formatPHP(actualCents)}</strong></div>
              {allocated !== actualCents && <p className="mt-1 text-destructive">Allocations must equal the actual payment amount.</p>}
            </div>
            {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy || allocated !== actualCents}>
              {busy ? "Saving…" : actualCents !== null && actualCents < scheduled ? "Yes, this is a partial payment" : actualCents !== null && actualCents > scheduled ? "Yes, amount includes extra fees" : "Confirm platform payment"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
