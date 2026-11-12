import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Wallet as WalletIcon } from "lucide-react";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Empty, Field, PageHeader, Panel, Select } from "@/components/app/bits";
import { Wallet } from "@/components/app/illustrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/config";
import { ACCOUNT_TYPES, accountTypeLabel } from "@/lib/labels";
import { centsToInput, formatPHP, parseAmount, parseSignedAmount } from "@/lib/money";
import { accountBalance } from "@/lib/selectors";
import { correctOpening, createAccount, openingTotal } from "@/lib/actions";
import type { AccountData, AccountType } from "@/lib/types";

export const Route = createFileRoute("/_shell/accounts")({
  head: () => ({
    meta: [
      { title: `Accounts — ${APP_NAME}` },
      {
        name: "description",
        content: "Cash, bank, e-wallet and savings accounts with derived balances.",
      },
      { property: "og:title", content: `Accounts — ${APP_NAME}` },
      { property: "og:description", content: "Cash, bank, e-wallet and savings accounts." },
    ],
  }),
  component: Accounts,
});

function Accounts() {
  const { store, snap } = useApp();
  const { spaceId, accounts } = useSpace();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [opening, setOpening] = useState("");
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!store || !spaceId) return;
    const o = opening.trim() ? parseAmount(opening) : 0;
    if (o === null || !name.trim()) {
      toast.error("Enter a name and valid opening balance.");
      return;
    }
    await createAccount(store, spaceId, name, type, o);
    setName("");
    setOpening("");
    toast.success("Account added");
  }
  return (
    <>
      <PageHeader title="Accounts" subtitle="Balances are calculated from recorded movements." />
      <Panel title="Add account" className="mb-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Name" htmlFor="ac-n">
            <Input id="ac-n" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="ac-t">
            <Select id="ac-t" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opening balance (₱)" htmlFor="ac-o">
            <Input
              id="ac-o"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((a) => (
          <AccountCard key={a.id} id={a.id} />
        ))}
      </div>
      {accounts.length === 0 && (
        <Empty
          icon={<WalletIcon />}
          illustration={<Wallet className="size-14" />}
          title="No accounts yet."
        />
      )}
      <span className="hidden">{snap.version}</span>
    </>
  );
}

function AccountCard({ id }: { id: string }) {
  const { store, snap } = useApp();
  const a = snap.accounts.find((x) => x.id === id)!;
  const [open, setOpen] = useState(centsToInput(openingTotal(id, snap.transactions)));
  async function fix() {
    const v = parseSignedAmount(open);
    if (v === null || !store) {
      toast.error("Invalid amount");
      return;
    }
    await correctOpening(store, snap, id, v);
    toast.success("Recorded as an opening balance correction");
  }
  async function archive() {
    await store?.save<AccountData>(
      "account",
      a.space_id,
      { ...a.data, archived: !a.data.archived },
      a.id,
    );
  }
  return (
    <Panel
      title={`${a.data.name}${a.data.archived ? " (archived)" : ""}`}
      action={
        <span className="text-xs text-muted-foreground">{accountTypeLabel(a.data.type)}</span>
      }
    >
      <p className="num text-2xl font-semibold">
        {formatPHP(accountBalance(id, snap.transactions))}
      </p>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Opening balance + adjustments" htmlFor={`op-${id}`}>
          <Input id={`op-${id}`} value={open} onChange={(e) => setOpen(e.target.value)} />
        </Field>
        <Button variant="outline" onClick={fix}>
          Correct
        </Button>
        <Button variant="ghost" onClick={archive}>
          {a.data.archived ? "Unarchive" : "Archive"}
        </Button>
      </div>
    </Panel>
  );
}
