import type { AccountType, Tx, TxType } from "./types";
import type { Snapshot } from "./store";
import { ordinaryLoans } from "./selectors";

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "E-wallet" },
  { value: "savings", label: "Savings" },
  { value: "other", label: "Other" },
];
export const accountTypeLabel = (t: AccountType) =>
  ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;

export const TX_TYPES: { value: TxType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "lend", label: "Lend money" },
  { value: "loan_repayment", label: "Repayment received" },
  { value: "adjustment", label: "Balance adjustment" },
  { value: "bnpl_purchase", label: "BNPL purchase" },
  { value: "bnpl_payment", label: "BNPL payment" },
];
export const txTypeLabel = (t: TxType) => TX_TYPES.find((x) => x.value === t)?.label ?? t;

export function bnplItemDescription(t: Tx, s: Snapshot): string {
  if (t.data.type !== "bnpl_purchase" && t.data.type !== "bnpl_payment") return "";
  return (
    s.loans.find((loan) => loan.id === t.data.loan_id && loan.data.module === "bnpl")?.data.label ??
    ""
  );
}

export function bnplPaymentItems(t: Tx, s: Snapshot) {
  if (t.data.type !== "bnpl_payment") return [];
  const related =
    t.data.payment_group_id === undefined
      ? [t]
      : s.transactions.filter(
          (item) =>
            !item.deleted &&
            item.space_id === t.space_id &&
            item.data.type === "bnpl_payment" &&
            item.data.payment_group_id === t.data.payment_group_id,
        );
  return related
    .map((item) => {
      const plan = s.loans.find(
        (loan) => loan.id === item.data.loan_id && loan.data.module === "bnpl",
      );
      return {
        label: plan?.data.label?.trim() || "BNPL purchase",
        provider: plan?.data.bnpl?.provider ?? "",
        amount: item.data.amount + (item.data.fee ?? 0),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function describeTx(t: Tx, s: Snapshot): string {
  const acc = (id?: string) => s.accounts.find((a) => a.id === id)?.data.name ?? "Unknown account";
  const cat = (id?: string) => s.categories.find((c) => c.id === id)?.data.name ?? "Uncategorized";
  const person = () => {
    const loan = ordinaryLoans(s.loans).find((l) => l.id === t.data.loan_id);
    return s.borrowers.find((b) => b.id === loan?.data.borrower_id)?.data.name ?? "someone";
  };
  switch (t.data.type) {
    case "income":
    case "expense":
      return cat(t.data.category_id);
    case "transfer":
      return `${acc(t.data.account_id)} → ${acc(t.data.to_account_id)}`;
    case "lend":
      return `Lent to ${person()}`;
    case "loan_repayment":
      return `Repayment from ${person()}`;
    case "bnpl_purchase":
    case "bnpl_payment":
      return bnplItemDescription(t, s) || (t.data.type === "bnpl_purchase" ? "BNPL purchase" : "BNPL payment");
    case "adjustment":
      return t.data.note ?? "Balance adjustment";
  }
}

export function personForTx(t: Tx, s: Snapshot) {
  const loan = ordinaryLoans(s.loans).find((l) => l.id === t.data.loan_id);
  return s.borrowers.find((b) => b.id === loan?.data.borrower_id)?.data.name ?? "";
}
