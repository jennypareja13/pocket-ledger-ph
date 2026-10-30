<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All money is integer centavos; balances/reports derive only from `TxData.entries` built by `buildEntries` (src/lib/ledger.ts) — keeps transfer/loan principal out of income/expense.
- Local IndexedDB is the source of truth; cloud sync goes through the single `ledger_records` table + `push_record` RPC with mutation-id idempotency — enables offline-first without duplicates.
- Keep tsconfig strict flags (exactOptionalPropertyTypes, noImplicitReturns); type optional fields as `?: T | undefined`.
