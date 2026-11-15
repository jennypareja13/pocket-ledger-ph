import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deletePlan, updatePlanDetails } from "@/lib/bnpl-actions";
import type { Loan } from "@/lib/types";

export function BnplPlanEditDialog({ plan, onClose }: { plan: Loan | null; onClose: () => void }) {
  const { store, snap } = useApp();
  const { categories } = useSpace();
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const paid =
    !!plan &&
    snap.transactions.some((tx) => tx.data.type === "bnpl_payment" && tx.data.loan_id === plan.id);
  useEffect(() => {
    if (!plan) return;
    setDescription(plan.data.label ?? "");
    setProvider(plan.data.bnpl?.provider ?? "");
    setDate(plan.data.date);
    setNote(plan.data.note ?? "");
    setCategoryId(
      snap.transactions.find(
        (tx) => tx.data.type === "bnpl_purchase" && tx.data.loan_id === plan.id,
      )?.data.category_id ?? "",
    );
    setError(undefined);
  }, [plan, snap.transactions]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!store || !plan) return;
    setBusy(true);
    try {
      await updatePlanDetails(store, plan.id, {
        description,
        provider,
        purchaseDate: date,
        categoryId,
        note,
      });
      toast.success("BNPL plan updated");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update plan.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!store || !plan) return;
    try {
      await deletePlan(store, plan.id);
      toast.success("BNPL plan deleted");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete plan.");
    }
  }
  const expenseCats = categories.filter((c) => c.data.type === "expense" && !c.data.archived);
  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit BNPL plan</DialogTitle>
        </DialogHeader>
        {plan && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Description" htmlFor="bnpl-edit-description">
              <Input
                id="bnpl-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider" htmlFor="bnpl-edit-provider">
                <Input
                  id="bnpl-edit-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </Field>
              <Field label="Purchase date" htmlFor="bnpl-edit-date">
                <Input
                  id="bnpl-edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Expense category" htmlFor="bnpl-edit-category">
              <Select
                id="bnpl-edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Choose…</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.data.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note" htmlFor="bnpl-edit-note">
              <Input id="bnpl-edit-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <p className="text-xs text-muted-foreground">
              Installment amounts, due dates, and payment history are not changed here. Paid
              installments are preserved.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              {!paid ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" className="text-destructive">
                      Delete plan
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this BNPL plan?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently removes the plan and its purchase record. A plan with
                        payment history cannot be deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={remove}>Delete plan</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <span className="text-xs text-muted-foreground">Has payment history</span>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
