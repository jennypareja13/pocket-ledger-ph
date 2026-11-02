import { createFileRoute } from "@tanstack/react-router";
import { HandCoins, Plus } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Bar, Empty, PageHeader, Panel } from "@/components/app/bits";
import { TxRow } from "@/components/app/TxRow";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { formatDate, todayManila } from "@/lib/dates";
import { formatPHP } from "@/lib/money";
import { loanOutstanding, ordinaryLoans } from "@/lib/selectors";
import type { LoanData } from "@/lib/types";

export const Route = createFileRoute("/_shell/loans")({
  head: () => ({
    meta: [
      { title: `Owed to me — ${APP_NAME}` },
      {
        name: "description",
        content: "Track money lent, partial repayments and what is still owed.",
      },
      { property: "og:title", content: `Owed to me — ${APP_NAME}` },
      { property: "og:description", content: "Track money lent and repayments." },
    ],
  }),
  component: Loans,
});

function Loans() {
  const { store, snap, openTx } = useApp();
  const { loans } = useSpace();
  const visibleLoans = ordinaryLoans(loans);
  return (
    <>
      <PageHeader
        title="Owed to me"
        subtitle="Lending and repayments move money, they are never income or expense."
        actions={
          <Button onClick={() => openTx({ preset: { type: "lend" } })}>
            <Plus /> Lend money
          </Button>
        }
      />
      {visibleLoans.length === 0 ? (
        <Empty icon={<HandCoins />} title="No loans in this space" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleLoans.map((l) => {
            const out = loanOutstanding(l.id, snap.transactions);
            const who = snap.borrowers.find((b) => b.id === l.data.borrower_id)?.data.name;
            const hist = snap.transactions.filter((t) => t.data.loan_id === l.id);
            const paid = l.data.principal - out;
            return (
              <Panel
                key={l.id}
                title={`${who}${l.data.settled_at ? " · Settled" : ""}`}
                action={<span className="num font-semibold">{formatPHP(out)} owed</span>}
              >
                <p className="mb-2 text-xs text-muted-foreground">
                  Lent {formatPHP(l.data.principal)} on {formatDate(l.data.date)}
                  {l.data.due_date && ` · due ${formatDate(l.data.due_date)}`}
                </p>
                <Bar pct={l.data.principal ? Math.round((paid / l.data.principal) * 100) : 0} />
                <div className="-mx-2 mt-3">
                  {hist.map((t) => (
                    <TxRow key={t.id} tx={t} />
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {out > 0 && (
                    <Button
                      size="sm"
                      onClick={() => openTx({ preset: { type: "loan_repayment", loan_id: l.id } })}
                    >
                      Record repayment
                    </Button>
                  )}
                  {out === 0 && !l.data.settled_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        store?.save<LoanData>(
                          "loan",
                          l.space_id,
                          { ...l.data, settled_at: todayManila() },
                          l.id,
                        )
                      }
                    >
                      Mark settled
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
