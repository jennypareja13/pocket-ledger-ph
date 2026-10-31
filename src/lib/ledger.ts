import type { Entry, LocalRecord, TxData } from "./types";
import { isValidDate } from "./dates";
import { MAX_CENTAVOS } from "./money";

type TxInput = Omit<TxData, "entries">;

/**
 * Build the linked balance movements for one transaction.
 * Transfer principal and loan principal never carry a `report` flag,
 * so they can never appear in income/expense totals. A transfer fee is a
 * single extra debit on the source account flagged as an expense.
 */
export function buildEntries(tx: TxInput): Entry[] {
  const a = tx.amount;
  switch (tx.type) {
    case "income":
      return [{ account_id: tx.account_id, delta: a, report: "income", category_id: tx.category_id }];
    case "expense":
      return [{ account_id: tx.account_id, delta: -a, report: "expense", category_id: tx.category_id }];
    case "transfer": {
      const e: Entry[] = [
        { account_id: tx.account_id, delta: -a },
        { account_id: tx.to_account_id, delta: a },
      ];
      if (tx.fee && tx.fee > 0)
        e.push({ account_id: tx.account_id, delta: -tx.fee, report: "expense", category_id: tx.fee_category_id });
      return e;
    }
    case "lend":
      return [{ account_id: tx.account_id, delta: -a }, { loan_id: tx.loan_id, delta: a }];
    case "loan_repayment":
      return [{ account_id: tx.account_id, delta: a }, { loan_id: tx.loan_id, delta: -a }];
    case "adjustment":
      return [{ account_id: tx.account_id, delta: a }];
    case "reimbursement_claim": {
      const covered = tx.reimbursable ?? 0;
      return [
        { account_id: tx.account_id, delta: -covered },
        { loan_id: tx.loan_id, delta: covered },
        ...(a > covered ? [{ account_id: tx.account_id, delta: -(a - covered), report: "expense" as const, category_id: tx.category_id }] : []),
      ];
    }
    case "reimbursement_payment":
    case "investment_withdrawal":
      return [{ account_id: tx.account_id, delta: a }, { loan_id: tx.loan_id, delta: -a }];
    case "investment_funding":
      return [{ account_id: tx.account_id, delta: -a }, { loan_id: tx.loan_id, delta: a }];
  }
}

export interface ValidationCtx {
  spaceId: string;
  accounts: LocalRecord<{ name: string }>[];
  categories: LocalRecord<{ type: string }>[];
  loans: LocalRecord<{ principal: number }>[];
  /** Outstanding of the referenced loan, excluding the tx being edited. */
  loanOutstanding?: number | undefined;
}

export function validateTx(tx: TxInput, ctx: ValidationCtx): string | null {
  const isInt = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n);
  if (!isValidDate(tx.date)) return "Choose a valid date.";
  if (!isInt(tx.amount) || Math.abs(tx.amount) > MAX_CENTAVOS) return "Enter a valid amount.";
  if (tx.type === "adjustment") {
    if (tx.amount === 0) return "Adjustment cannot be zero.";
  } else if (tx.amount <= 0) return "Amount must be greater than zero.";
  if (tx.fee !== undefined && (!isInt(tx.fee) || tx.fee < 0)) return "Fee cannot be negative.";
  const inSpace = (id?: string) => ctx.accounts.some((x) => x.id === id && x.space_id === ctx.spaceId && !x.deleted);
  if (!inSpace(tx.account_id)) return "Choose an account in this space.";
  if (tx.type === "income" || tx.type === "expense") {
    const c = ctx.categories.find((x) => x.id === tx.category_id && x.space_id === ctx.spaceId);
    if (!c || c.data.type !== tx.type) return `Choose an ${tx.type} category.`;
  }
  if (tx.type === "transfer") {
    if (!inSpace(tx.to_account_id)) return "Choose a destination account in this space.";
    if (tx.to_account_id === tx.account_id) return "Source and destination must differ.";
    if (tx.fee && tx.fee > 0) {
      const c = ctx.categories.find((x) => x.id === tx.fee_category_id && x.space_id === ctx.spaceId);
      if (!c || c.data.type !== "expense") return "Choose a fee expense category.";
    }
  }
  if (tx.type === "lend" || tx.type === "loan_repayment") {
    const l = ctx.loans.find((x) => x.id === tx.loan_id && x.space_id === ctx.spaceId);
    if (!l) return "Choose a loan in this space.";
    if (tx.type === "loan_repayment" && ctx.loanOutstanding !== undefined && tx.amount > ctx.loanOutstanding)
      return "Repayment is more than what is still owed.";
  }
  return null;
}
