import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteInstallmentPayment, updateInstallmentPayment } from "@/lib/bnpl-actions";
import { formatDate } from "@/lib/dates";
import { centsToInput, formatPHP, parseAmount } from "@/lib/money";
import type { Tx } from "@/lib/types";

export function BnplPaymentEditDialog({ payment, onClose }: { payment: Tx | null; onClose: () => void }) {
  const { store, snap } = useApp();
  const { accounts } = useSpace();
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const active = accounts.filter((a) => !a.data.archived || a.id === payment?.data.account_id);
  useEffect(() => {
    if (!payment) return;
    setAccountId(payment.data.account_id);
    setDate(payment.data.date);
    setAmount(centsToInput(payment.data.amount + (payment.data.fee ?? 0)));
    setError(undefined);
  }, [payment]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store || !payment) return;
    const actualPaid = parseAmount(amount);
    if (actualPaid === null) return setError("Enter a valid amount.");
    setBusy(true);
    try {
      await updateInstallmentPayment(store, payment.id, { accountId, date, actualPaid });
      toast.success("BNPL payment updated");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update payment."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!store || !payment) return;
    try {
      await deleteInstallmentPayment(store, payment.id);
      toast.success("Payment deleted. The installment is unpaid again.");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete payment."); }
  }
  const installment = payment?.data.installment_id
    ? snap.loans.flatMap((loan) => loan.data.bnpl?.schedule ?? []).find((item) => item.id === payment.data.installment_id)
    : undefined;
  return <Dialog open={!!payment} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Edit BNPL payment</DialogTitle></DialogHeader>
      {payment && <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted-foreground">Scheduled installment: {installment ? formatDate(installment.due_date) : "Date unavailable"} · {installment ? formatPHP(installment.amount) : "—"}</p>
        <Field label="Paid from" htmlFor="bnpl-payment-account"><Select id="bnpl-payment-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose an account…</option>{active.map((a) => <option key={a.id} value={a.id}>{a.data.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payment date" htmlFor="bnpl-payment-date"><Input id="bnpl-payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Actual amount paid" htmlFor="bnpl-payment-amount"><Input id="bnpl-payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">The scheduled installment amount remains unchanged. Any excess is retained as a separate BNPL fee/expense.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" className="text-destructive">Delete payment</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this payment?</AlertDialogTitle><AlertDialogDescription>This removes the payment movement and makes the installment unpaid again. It does not delete the plan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete payment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div>
        </div>
      </form>}
    </DialogContent>
  </Dialog>;
}

