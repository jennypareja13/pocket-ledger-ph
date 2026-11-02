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
];
export const txTypeLabel = (t: TxType) => TX_TYPES.find((x) => x.value === t)?.label ?? t;

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
    case "reimbursement_claim":
      return "Reimbursement claim";
    case "reimbursement_payment":
      return "Reimbursement received";
    case "investment_funding":
      return "Investment contribution";
    case "investment_withdrawal":
      return "Investment withdrawal";
    case "adjustment":
      return t.data.note ?? "Balance adjustment";
  }
}

export function personForTx(t: Tx, s: Snapshot) {
  const loan = ordinaryLoans(s.loans).find((l) => l.id === t.data.loan_id);
  return s.borrowers.find((b) => b.id === loan?.data.borrower_id)?.data.name ?? "";
}
