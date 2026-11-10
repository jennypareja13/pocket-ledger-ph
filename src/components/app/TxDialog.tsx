import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useApp, useSpace } from "./AppProvider";
import { Field, Select } from "./bits";
import { createLoan, deleteLoan, saveTransaction, type TxInput } from "@/lib/actions";
import { buildEntries } from "@/lib/ledger";
import { centsToInput, formatPHP, parseAmount, parseSignedAmount } from "@/lib/money";
import { todayManila } from "@/lib/dates";
import { loanOutstanding, ordinaryLoans } from "@/lib/selectors";
import type { BorrowerData, LoanData, TxType } from "@/lib/types";

const TABS: { value: TxType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

type TxTabOptions = {
  edit?: { data: { type: TxType } } | null;
  preset?: { type?: TxType } | null;
};

export function availableTxTabs({ edit, preset }: TxTabOptions): TxType[] {
  const specialType = edit?.data.type ?? preset?.type;
  return specialType === "lend" || specialType === "loan_repayment"
    ? [specialType]
    : ["expense", "income", "transfer"];
}

export function TxDialog() {
  const { txDialog, closeTx, store, snap } = useApp();
  const { space, spaceId, accounts, categories, loans } = useSpace();
  const edit = txDialog.edit;
  const tabs = availableTxTabs({ edit, preset: txDialog.preset });
  const [type, setType] = useState<TxType>("expense");
  const [f, setF] = useState({
    date: todayManila(),
    amount: "",
    fee: "",
    category_id: "",
    fee_category_id: "",
    account_id: "",
    to_account_id: "",
    loan_id: "",
    borrower_id: "",
    new_borrower: "",
    due_date: "",
    note: "",
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const activeAccounts = accounts.filter(
    (a) => !a.data.archived || a.id === edit?.data.account_id || a.id === edit?.data.to_account_id,
  );
  const cats = (t: "income" | "expense") =>
    categories.filter(
      (c) => c.data.type === t && (!c.data.archived || c.id === edit?.data.category_id),
    );
  const feeCat = categories.find((c) => c.data.system === "fee") ?? cats("expense")[0];
  const openLoans = ordinaryLoans(loans).filter(
    (l) => !l.data.settled_at || l.id === edit?.data.loan_id,
  );
  const borrowers = snap.borrowers.filter(
    (b) => !b.data.archived && (b.space_id === spaceId || b.space_id === null),
  );

  useEffect(() => {
    if (!txDialog.open) return;
    setError(undefined);
    if (edit) {
      const d = edit.data;
      const loan = ordinaryLoans(loans).find((l) => l.id === d.loan_id);
      setType(d.type);
      setF({
        date: d.date,
        amount: centsToInput(d.amount),
        fee: d.fee ? centsToInput(d.fee) : "",
        category_id: d.category_id ?? "",
        fee_category_id: d.fee_category_id ?? feeCat?.id ?? "",
        account_id: d.account_id,
        to_account_id: d.to_account_id ?? "",
        loan_id: d.loan_id ?? "",
        borrower_id: loan?.data.borrower_id ?? "",
        new_borrower: "",
        due_date: loan?.data.due_date ?? "",
        note: d.note ?? "",
      });
    } else {
      const p = txDialog.preset ?? {};
      setType(p.type ?? "expense");
      setF({
        date: todayManila(),
        amount: "",
        fee: "",
        category_id: "",
        fee_category_id: feeCat?.id ?? "",
        account_id: p.account_id ?? activeAccounts[0]?.id ?? "",
        to_account_id: "",
        loan_id: p.loan_id ?? "",
        borrower_id: borrowers[0]?.id ?? "",
        new_borrower: "",
        due_date: "",
        note: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txDialog.open, edit?.id]);

  const amount = type === "adjustment" ? parseSignedAmount(f.amount) : parseAmount(f.amount);
  const fee = f.fee.trim() ? parseAmount(f.fee) : 0;
  const outstanding = f.loan_id ? loanOutstanding(f.loan_id, snap.transactions, edit?.id) : 0;
  const preview = useMemo(() => {
    if (type !== "transfer" || amount === null || fee === null || amount <= 0) return null;
    return { source: amount + fee, dest: amount, fee };
  }, [type, amount, fee]);

  if (!store || !spaceId) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store || !spaceId) return;
    setError(undefined);
    if (amount === null) return setError("Enter a valid amount, e.g. 1,000.00");
    if (fee === null) return setError("Enter a valid fee or leave it empty.");
    setBusy(true);
    try {
      if (type === "lend" && !edit) {
        let borrowerId = f.borrower_id;
        if (borrowerId === "__new" || !borrowerId) {
          if (!f.new_borrower.trim()) throw new Error("Enter the person's name.");
          const b = await store.save<BorrowerData>("borrower", spaceId, {
            name: f.new_borrower.trim(),
          });
          borrowerId = b.id;
        }
        const s2 = store.getSnapshot();
        await createLoan(store, s2, spaceId, {
          borrower_id: borrowerId,
          account_id: f.account_id,
          principal: amount,
          date: f.date,
          due_date: f.due_date || undefined,
          note: f.note.trim() || undefined,
        });
      } else if (type === "lend" && edit) {
        const loan = ordinaryLoans(loans).find((l) => l.id === edit.data.loan_id);
        if (!loan) throw new Error("Loan not found.");
        const repaid = loan ? -loanOutstanding(loan.id, snap.transactions, edit.id) : 0;
        if (amount < repaid)
          throw new Error(
            `Amount can't be less than what was already repaid (${formatPHP(repaid)}).`,
          );
        const input: TxInput = {
          type: "lend",
          date: f.date,
          amount,
          account_id: f.account_id,
          loan_id: loan.id,
          note: f.note.trim() || undefined,
        };
        await store.apply([
          {
            kind: "transaction",
            id: edit.id,
            space_id: spaceId,
            data: { ...input, entries: buildEntries(input) },
          },
          {
            kind: "loan",
            id: loan.id,
            space_id: spaceId,
            data: {
              ...loan.data,
              account_id: f.account_id,
              principal: amount,
              date: f.date,
              due_date: f.due_date || undefined,
            } satisfies LoanData,
          },
        ]);
      } else {
        await saveTransaction(
          store,
          snap,
          spaceId,
          {
            type,
            date: f.date,
            amount,
            account_id: f.account_id,
            category_id: f.category_id || undefined,
            to_account_id: f.to_account_id || undefined,
            fee: type === "transfer" ? fee : undefined,
            fee_category_id: type === "transfer" && fee ? f.fee_category_id : undefined,
            loan_id: f.loan_id || undefined,
            note: f.note,
          },
          edit?.id,
        );
      }
      toast.success(edit ? "Changes saved on this device" : "Saved on this device");
      closeTx();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!store || !edit) return;
    if (edit.data.type === "lend" && edit.data.loan_id)
      await deleteLoan(store, snap, edit.data.loan_id);
    else await store.remove([edit.id]);
    toast.success("Transaction deleted; balances recalculated");
    closeTx();
  }

  const isLendEdit = !!edit && edit.data.type === "lend";
  const loanRepayCount = isLendEdit
    ? snap.transactions.filter(
        (t) => t.data.loan_id === edit?.data.loan_id && t.data.type === "loan_repayment",
      ).length
    : 0;
  const title =
    type === "lend"
      ? "Lend money"
      : type === "loan_repayment"
        ? "Record repayment"
        : edit
          ? "Edit transaction"
          : "New transaction";

  return (
    <Dialog open={txDialog.open} onOpenChange={(o) => !o && closeTx()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            In <strong className="text-foreground">{space?.data.name}</strong>. Saved on this device
            first, then synced.
          </DialogDescription>
        </DialogHeader>
        {tabs.length > 1 && (
          <div
            role="tablist"
            aria-label="Transaction type"
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={type === t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  "rounded-md px-1 py-1.5 text-xs font-medium transition-colors",
                  type === t.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {activeAccounts.length === 0 ? (
          <p className="rounded-lg bg-warning-soft p-3 text-sm">
            Add an account in this space first (Accounts page).
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={type === "adjustment" ? "Adjustment (₱, can be negative)" : "Amount (₱)"}
                htmlFor="tx-amount"
              >
                <Input
                  id="tx-amount"
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.00"
                  value={f.amount}
                  onChange={set("amount")}
                  required
                  className="num"
                />
              </Field>
              <Field label="Date" htmlFor="tx-date">
                <Input id="tx-date" type="date" value={f.date} onChange={set("date")} required />
              </Field>
            </div>

            {(type === "income" || type === "expense") && (
              <Field label="Category" htmlFor="tx-cat">
                <Select id="tx-cat" value={f.category_id} onChange={set("category_id")} required>
                  <option value="">Choose…</option>
                  {cats(type).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.data.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label={
                type === "transfer"
                  ? "From account"
                  : type === "income" || type === "loan_repayment"
                    ? "Into account"
                    : "Account"
              }
              htmlFor="tx-acc"
            >
              <Select id="tx-acc" value={f.account_id} onChange={set("account_id")} required>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.data.name}
                  </option>
                ))}
              </Select>
            </Field>

            {type === "transfer" && (
              <>
                <Field label="To account" htmlFor="tx-to">
                  <Select
                    id="tx-to"
                    value={f.to_account_id}
                    onChange={set("to_account_id")}
                    required
                  >
                    <option value="">Choose…</option>
                    {activeAccounts
                      .filter((a) => a.id !== f.account_id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.data.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Transfer / withdrawal fee (₱)"
                    htmlFor="tx-fee"
                    hint="Optional. Deducted from the source and recorded once as an expense."
                  >
                    <Input
                      id="tx-fee"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={f.fee}
                      onChange={set("fee")}
                      className="num"
                    />
                  </Field>
                  <Field label="Fee category" htmlFor="tx-feecat">
                    <Select
                      id="tx-feecat"
                      value={f.fee_category_id}
                      onChange={set("fee_category_id")}
                    >
                      {cats("expense").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {preview && (
                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground num">
                    Source −{formatPHP(preview.source)} · Destination +{formatPHP(preview.dest)}
                    {preview.fee > 0 && <> · Expense +{formatPHP(preview.fee)}</>}
                  </div>
                )}
              </>
            )}

            {type === "lend" && !isLendEdit && (
              <>
                <Field label="Person" htmlFor="tx-borrower">
                  <Select
                    id="tx-borrower"
                    value={f.borrower_id || "__new"}
                    onChange={set("borrower_id")}
                  >
                    {borrowers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.data.name}
                      </option>
                    ))}
                    <option value="__new">+ New person</option>
                  </Select>
                </Field>
                {(f.borrower_id === "__new" || !f.borrower_id) && (
                  <Field
                    label="Name"
                    htmlFor="tx-newb"
                    hint="Just a name is enough — no contact details needed."
                  >
                    <Input id="tx-newb" value={f.new_borrower} onChange={set("new_borrower")} />
                  </Field>
                )}
              </>
            )}
            {type === "lend" && (
              <Field label="Due date (optional)" htmlFor="tx-due">
                <Input id="tx-due" type="date" value={f.due_date} onChange={set("due_date")} />
              </Field>
            )}
            {type === "lend" && (
              <p className="text-xs text-muted-foreground">
                Lending moves money out of the account into “owed to me”. It is not an expense.
              </p>
            )}

            {type === "loan_repayment" && (
              <Field
                label="Loan being repaid"
                htmlFor="tx-loan"
                hint={
                  f.loan_id
                    ? `Still owed: ${formatPHP(outstanding)}. Not counted as income.`
                    : undefined
                }
              >
                <Select id="tx-loan" value={f.loan_id} onChange={set("loan_id")} required>
                  <option value="">Choose…</option>
                  {openLoans.map((l) => {
                    const b = snap.borrowers.find((x) => x.id === l.data.borrower_id);
                    return (
                      <option key={l.id} value={l.id}>
                        {b?.data.name} —{" "}
                        {formatPHP(loanOutstanding(l.id, snap.transactions, edit?.id))} owed
                      </option>
                    );
                  })}
                </Select>
              </Field>
            )}

            <Field label="Note (optional)" htmlFor="tx-note">
              <Textarea id="tx-note" rows={2} value={f.note} onChange={set("note")} />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              {edit ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" className="text-destructive">
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {isLendEdit
                          ? `This deletes the whole loan${loanRepayCount ? ` and its ${loanRepayCount} repayment(s)` : ""}. Account balances will be recalculated.`
                          : "All linked balance movements are removed together and balances are recalculated."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeTx}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
