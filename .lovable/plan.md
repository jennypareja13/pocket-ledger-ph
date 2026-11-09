# PocketVault — staged plan from the current state

## 0. Git state I can see (checked, read-only)
- HEAD SHA: `39003caed7e39120de5270dd495465b8e304139f` ("Implemented BNPL UI phase-1"). This matches what the project metadata says, which is **main**.
- My local branch name is an internal edit branch (`edit/edt-...`). It does not show which GitHub branch the project syncs to. I cannot see the Git connection, `add-responsible-bnpl-campaign-spec` or PR #3.
- So: I can't confirm the connected branch from here. Because the SHA matches main, assume **every write goes to main** until the owner confirms otherwise. Note that the BNPL phase-1 UI is already on main.

## 1. Current-state audit
| Area | State |
|---|---|
| Pages | Home, Accounts, Transactions, Budgets, Loans, Spaces, Analysis, BNPL, Settings, Auth. `_shell.reports.tsx` is still there (probably a redirect; needs checking) |
| BNPL logic | `bnpl.ts`, `bnpl-actions.ts` (toggle, budget, createPlan, markInstallmentPaid for **one installment**, updateDueDate, deletePlan), `bnpl-view.ts`. Already on by default (`modules.bnpl !== false`) |
| BNPL UI | Dashboard, create-plan dialog and single-installment pay dialog are done. **Missing:** Settings on/off switch and budget field, paying several installments from one provider at once, UI tests |
| Budgets | Custom category budgets in the Budgets page; the BNPL monthly budget is stored per Main Space |
| Date filters | Analysis has Month/Year only. **Missing:** 1 day and 1 week, plus the same filters on Transactions |
| Notifications | None: no service worker, no reminders |
| Theme | Palette, Manrope and dark-mode CSS exist. **Missing:** a persisted light/dark/system switch (needs checking) |
| Offline/PWA | Manifest and icons exist; no service worker (SSR/edge compatibility not shown to be safe); no APK |
| Auth/RLS | `ledger_records` is limited to each owner; `feedback` allows admin reading through server-set `app_metadata.role`. No campaign tables yet |
| Tests | Vitest with 12 test files; scripts `test`, `lint`, `build` |

## 2. Batches (each one small and checked before the next)
**Batch 1: finish BNPL settings and fixes (no migration)**
- Settings: BNPL on/off switch and one monthly budget (`_shell.settings.tsx`, reusing `toggleBnpl`/`setBnplBudget`).
- Review PR #3's even-split remainder fix and bring it in instead of duplicating it.
- Tests: turning BNPL off hides the menu item but keeps all records; new spaces default to on; budget is stored in centavos.

**Batch 2: paying several installments from one provider (no migration)**
- New `payInstallmentsBatch(store, mainId, {provider, accountId, date, items:[{installmentId, amount}]})` in `bnpl-actions.ts`. It checks every item first, then makes one write; each installment keeps its own payment record with its own fixed ID.
- Rejects mixed providers, already-paid or deleted installments, installments from other spaces, and duplicates. Then the pay dialog gets multi-select by provider.
- Tests: no second purchase expense; cash and amount owed go down by the exact total; retrying doesn't create duplicates; mixing providers is rejected; Managed Spaces are rejected.

**Batch 3: shared date filter**
- One shared period helper (`dates.ts`/`selectors.ts`) for day, week, month and year in Manila time, used by Analysis, Transactions and the CSV export.
- Tests: start and end of each period, week starting Monday (assumption), changing the filter never changes records.

**Batch 4: theme switch**
- Light/dark/system choice saved locally on the device, applied without a flash on first load (`__root.tsx`, Settings).

**Batch 5: BNPL reminders (BLOCKED until the timing is confirmed)**
- Planned: in-app reminders worked out from unpaid due dates (no push messages, no service worker). Turning BNPL off hides them.

**Batch 6: campaign hub (needs a migration and your separate approval)**
- New `campaigns` table: everyone signed in can read published rows; only admins can create, edit, publish or archive, enforced on the server (server-set role, checked with server functions and database rules). No submissions or comments.
- Tests: a regular user can't write or read drafts; an admin can.

**Batch 7: first-time tutorial (last)**, only after Batches 1–6 are checked.

## 3. Dependencies and risks
- No new libraries needed. Only Batch 6 needs a migration (adding new tables only; existing records untouched).
- Risks: writing to main by mistake; PR #3 clashing with Batch 1; a service worker on the edge host (avoided).

## 4. Safe Git workflow
1. The owner opens Project settings → Git, creates or selects a feature branch (e.g. `bnpl-phase-2`), and confirms the branch name in chat.
2. At the start of each batch I report HEAD; you compare it with the latest commit on that branch on GitHub.
3. No merging, publishing or deploying without your explicit approval.

## 5. Blocking questions
1. Reminder timing: does "5 days before, then consecutively 2 days after that" mean 5, 3 and 1 days before plus the due date, or something else?
2. Should the week start on Monday?
3. Bring PR #3 in first, or leave it to you?
