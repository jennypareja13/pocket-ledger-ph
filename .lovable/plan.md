# BNPL UI phase 1 — plan

## 1. Branch safety (read this first)

What I checked:
- The workspace is at commit `5b6aeca` ("Reset corrupt quarantine value after backup"), the same commit you named.
- My workspace only sees Lovable's internal copy of the code, tracking `main`. I can't see the GitHub connection, the branches on GitHub, or which branch is synced. So I couldn't confirm from here that `bnpl-ui-phase-1` exists on GitHub.

How the sync works:
- Lovable syncs with one GitHub branch at a time: the "synced branch". Every change I make goes to that branch. Right now it's almost certainly `main`.
- I can't switch the branch myself. Only you can, in **Project settings → Git → branch picker**: pick `bnpl-ui-phase-1`. (Branch switching is a Git sync feature. If the picker isn't shown, it isn't available on this project, and I'd stop rather than write to `main`.)
- Once you switch, my edits go to `bnpl-ui-phase-1` only. Commits pushed to `main` from elsewhere won't reach Lovable until you switch back.
- **Risk of writing to main:** if you approve this plan before switching, the build lands on `main`. Please switch first, then tell me "switched to bnpl-ui-phase-1". I'll check the starting commit is still `5b6aeca` before I edit anything.
- Other options: build in a Lovable draft and open a pull request into the synced branch. Or switch, build, and merge into `main` yourself later.
- The preview shows whatever branch is synced. Publishing is separate, and I won't touch it.

## 2. What exists today (verified)

- `src/lib/bnpl.ts` has the BNPL math: preset durations (1, 3, 6, 9, 12, 18, 24, maximum 36), `buildSchedule`, `scheduleDates`, `validateSchedule`, `scheduleTotal`, `installmentStatus` (paid / due today / upcoming / past due, which only reports and never marks anything paid), `monthCommitment`, `outstandingTotal`, `budgetStatus` and `budgetImpact`.
- `src/lib/bnpl-actions.ts` has the actions the screens will call:
  - turn BNPL on or off for a space, and set or clear its monthly BNPL budget;
  - create a plan with a description, provider, purchase date, category, optional purchase total, installment schedule and note;
  - mark an installment paid with the account, date and amount actually paid;
  - change an installment's due date, and delete a plan.
  - Each action checks everything before one save. A purchase records the expense once. A payment lowers the account and the amount still owed; any amount above the scheduled one goes to "BNPL fees & interest". Paying twice is blocked.
  - There's no partial-payment action, so this phase has no partial payments.
- `src/lib/selectors.ts` lists a space's plans, the paid installments and the amount still owed. Plans only belong to a Main Space.
- The menu is in `src/routes/_shell.tsx` (the `NAV` list plus the phone menu). Settings has no BNPL switch yet. BNPL counts as on unless it's been turned off.

## 3. What gets built (minimal)

1. **BNPL page** (`/bnpl`), shown only for an active Main Space with BNPL on:
   - this month's unpaid installments total, the BNPL budget, what's left, and a warning when it's near or over (uses `budgetStatus`);
   - the total still owed on future installments;
   - a list of upcoming installments with date, provider, amount, status, and a "Mark as paid" button;
   - active plans showing progress (paid out of total installments) and how much is still owed.
   - Empty, turned-off and managed-space views show a plain message.
2. **Create plan form** (dialog): description, provider, purchase date, expense category, optional purchase total, and a note. Duration buttons for 1 / 3 / 6 / 12, plus "Custom" (1–36). Also a first due date, and one amount box per installment with an "Even split" helper you can overwrite. Each due date can be edited. The form shows the total and how the plan affects your budget before saving, then calls `createPlan`.
3. **Mark as paid form** (dialog): account (active accounts in this space), payment date (today by default), and amount actually paid (the scheduled amount by default). Calls `markInstallmentPaid`. Nothing is marked paid by date alone.
4. **Settings**: a "Buy now, pay later" switch and an optional monthly budget for the selected Main Space, using the existing actions.
5. **Menu**: a "BNPL" item on desktop and in "More" on phones, only when it's on. The phone's five-button bar stays as it is.

Not in this phase: reminders, partial payments, editing or deleting plans from the page (the delete action exists, but you didn't ask for it), and any change to how money is counted.

## 4. Technical details

Files likely to change:
- new `src/routes/_shell.bnpl.tsx` (the page)
- new `src/components/app/bnpl-plan-dialog.tsx`, `src/components/app/bnpl-pay-dialog.tsx`
- new `src/lib/bnpl-view.ts`: pure helpers that turn a snapshot into page data (upcoming list, plan progress, combined totals), so they can be tested
- `src/routes/_shell.tsx`: menu entry
- `src/routes/_shell.settings.tsx`: BNPL switch and budget
- `src/routeTree.gen.ts` regenerates by itself
- `roadmap.md`, and `AGENTS.md` (one rule: the BNPL screens call only `bnpl-actions`)

Not changed: `bnpl.ts`, `bnpl-actions.ts`, `ledger.ts`, selectors used for money totals, any tests that already exist.

Tests (new `src/test/bnpl-view.test.ts`):
- a month's unpaid total leaves out paid installments; what's left and the warning match `budgetStatus` at below, at and above the budget;
- future amount owed equals unpaid installments only;
- the upcoming list never shows an overdue item as paid;
- a managed space, or BNPL turned off, gives an empty view;
- create + pay through the actions: the expense shows once in the month total, and the payment lowers cash and the amount owed without adding to expenses.

All tests run with `bunx vitest run`, plus ESLint and Prettier on the changed files. A screen check in a browser needs a signed-in session or a local guest ledger. I'll say plainly if I couldn't do it.

New libraries: **none**; it reuses shadcn parts, lucide icons and the existing form styles. Database or schema changes: **none**, because plans and payments already fit the existing records. No publishing or deploying.
