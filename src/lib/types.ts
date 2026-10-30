export type Kind = "space" | "account" | "category" | "transaction" | "budget" | "borrower" | "loan";
export type SyncState = "pending" | "synced" | "error" | "conflict";

export interface Meta {
  sync: SyncState;
  /** Last server revision this local copy is based on (0 = never uploaded). */
  rev: number;
  /** Stable id of the latest local change; used as idempotency key on upload. */
  mutation_id: string;
  error?: string | undefined;
  server?: { data: unknown; deleted: boolean; rev: number } | undefined;
}

export interface LocalRecord<D = unknown> {
  id: string;
  kind: Kind;
  space_id: string | null;
  data: D;
  deleted: boolean;
  created_at: string;
  updated_at: string;
  _meta: Meta;
}

export type SpaceType = "personal" | "managed";
export interface SpaceData { name: string; type: SpaceType; archived?: boolean | undefined; note?: string | undefined }

export type AccountType = "cash" | "bank" | "ewallet" | "savings" | "other";
export interface AccountData { name: string; type: AccountType; archived?: boolean | undefined }

export type CategoryType = "income" | "expense";
export interface CategoryData { name: string; type: CategoryType; archived?: boolean | undefined; system?: "fee" | undefined }

export type TxType = "income" | "expense" | "transfer" | "lend" | "loan_repayment" | "adjustment";
export interface Entry {
  account_id?: string | undefined;
  loan_id?: string | undefined;
  /** Signed centavos. Positive increases the account/receivable. */
  delta: number;
  /** Set only on movements that count in income/expense reports. */
  report?: "income" | "expense" | undefined;
  category_id?: string | undefined;
}
export interface TxData {
  type: TxType;
  date: string; // YYYY-MM-DD
  /** Centavos. Positive, except adjustments which may be negative. */
  amount: number;
  fee?: number | undefined;
  category_id?: string | undefined;
  fee_category_id?: string | undefined;
  account_id: string;
  to_account_id?: string | undefined;
  loan_id?: string | undefined;
  note?: string | undefined;
  /** Derived, linked balance movements. Rebuilt on every save. */
  entries: Entry[];
}

export interface BudgetData { category_id: string; month: string; amount: number }
export interface BorrowerData { name: string; note?: string | undefined; archived?: boolean | undefined }
export interface LoanData {
  borrower_id: string;
  account_id: string;
  principal: number;
  date: string;
  due_date?: string | undefined;
  note?: string | undefined;
  settled_at?: string | undefined;
}

export type Space = LocalRecord<SpaceData>;
export type Account = LocalRecord<AccountData>;
export type Category = LocalRecord<CategoryData>;
export type Tx = LocalRecord<TxData>;
export type Budget = LocalRecord<BudgetData>;
export type Borrower = LocalRecord<BorrowerData>;
export type Loan = LocalRecord<LoanData>;
