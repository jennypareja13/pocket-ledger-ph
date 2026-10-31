import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, HandCoins, Scale, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "./AppProvider";
import { SyncDot } from "./bits";
import { describeTx } from "@/lib/labels";
import { formatDate } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import type { Tx } from "@/lib/types";

const ICONS = {
  income: ArrowDownLeft, expense: ArrowUpRight, transfer: ArrowLeftRight,
  lend: HandCoins, loan_repayment: Undo2, adjustment: Scale, reimbursement_claim: HandCoins, reimbursement_payment: Undo2, investment_funding: ArrowUpRight, investment_withdrawal: ArrowDownLeft,
};

export function TxRow({ tx }: { tx: Tx }) {
  const { snap, openTx } = useApp();
  const d = tx.data;
  const Icon = ICONS[d.type];
  const acc = snap.accounts.find((a) => a.id === d.account_id)?.data.name;
  const sign = d.type === "income" || d.type === "loan_repayment" ? "+" : d.type === "expense" || d.type === "lend" ? "−" : d.type === "adjustment" && d.amount < 0 ? "−" : d.type === "adjustment" ? "+" : "";
  const tone = d.type === "income" ? "text-income" : d.type === "expense" ? "text-expense" : "text-foreground";
  return (
    <button type="button" onClick={() => { if (!d.type.startsWith("investment_") && !d.type.startsWith("reimbursement_")) openTx({ edit: tx }); }}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-muted [&_svg]:size-4", tone)}><Icon /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{describeTx(tx, snap)}</span>
        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {formatDate(d.date)}{d.type !== "transfer" && acc ? ` · ${acc}` : ""}{d.note && d.type !== "adjustment" ? ` · ${d.note}` : ""}
        </span>
      </span>
      <span className="text-right">
        <span className={cn("num block text-sm font-semibold", tone)}>{sign}{formatPHP(Math.abs(d.amount))}</span>
        <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          {d.fee ? <span className="num text-expense">fee {formatPHP(d.fee)}</span> : null}
          <SyncDot state={tx._meta.sync} />
        </span>
      </span>
    </button>
  );
}
