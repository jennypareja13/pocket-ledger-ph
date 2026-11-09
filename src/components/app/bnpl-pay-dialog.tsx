import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { markInstallmentPaid } from "@/lib/bnpl-actions";
import type { UpcomingItem } from "@/lib/bnpl-view";
import { formatDate, todayManila } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";

export function BnplPayDialog({
  item,
  onClose,
}: {
  item: UpcomingItem | null;
  onClose: () => void;
}) {
  const { store } = useApp();
  const { space, accounts } = useSpace();
  const active = accounts.filter((a) => !a.deleted && !a.data.archived);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayManila());
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!item) return;
    setAmount(centsToInput(item.installment.amount));
    setDate(todayManila());
    setErr(undefined);
  }, [item]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store || !space || !item) return;
    const actualPaid = parseAmount(amount);
    if (actualPaid === null) return setErr("Enter the amount you actually paid, e.g. 1,000.00");
    if (actualPaid < item.installment.amount)
      return setErr("Partial payments aren't supported yet. Enter at least the scheduled amount.");
    setBusy(true);
    try {
      await markInstallmentPaid(store, space.id, item.planId, item.installment.id, {
        accountId,
        date,
        actualPaid,
      });
      toast.success("Installment marked as paid");
      onClose();
    } catch (error) {
      setErr(
        error instanceof Error ? error.message : "Could not save the payment. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
        </DialogHeader>
        {item && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {item.label} · {item.provider} · due {formatDate(item.installment.due_date)} ·{" "}
              {formatPHP(item.installment.amount)}
            </p>
            <Field label="Paid from" htmlFor="pay-acc">
              <Select id="pay-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Choose an account…</option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.data.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment date" htmlFor="pay-date">
                <Input
                  id="pay-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field
                label="Amount paid"
                htmlFor="pay-amt"
                hint="Anything above the scheduled amount counts as fees."
              >
                <Input
                  id="pay-amt"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>
            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Confirm payment"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
