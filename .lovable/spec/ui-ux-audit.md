# PocketVault UI/UX and Product Audit

Audit baseline: `main` at `06c454a42ca5ac5c4a6db654deabae4fa6679cdc`
Audit date: 2026-11-09
Scope: source-level review of the existing route components, shared app shell, design tokens, PWA configuration, and existing tests.

This is a source audit, not a live visual/browser QA pass. No application behavior was changed during this audit.

## 1. Current application structure

- Home dashboard: `src/routes/_shell.index.tsx`
- Transactions: `src/routes/_shell.transactions.tsx`
- Accounts: `src/routes/_shell.accounts.tsx`
- Budgets: `src/routes/_shell.budgets.tsx`
- Loans: `src/routes/_shell.loans.tsx`
- Analysis: `src/routes/_shell.analysis.tsx`
- BNPL: `src/routes/_shell.bnpl.tsx`
- Spaces and categories: `src/routes/_shell.spaces.tsx`
- Settings and sync: `src/routes/_shell.settings.tsx`
- Authentication: `src/routes/auth.tsx`
- Reports redirects to Analysis.

The shared shell provides desktop sidebar navigation, a mobile bottom navigation bar, a More sheet, a space picker, sync status, and a global add-transaction dialog.

## 2. Page-by-page findings

### Home
Existing:
- Available balance, receivables, income, expenses, and net cash flow.
- Six-month income/expense chart and category spending chart.
- Managed-fund overview, recent transactions, account balances, and budget summaries.

Follow-up:
- Keep the dashboard focused on financial information.
- Consider a small Responsible BNPL Use featured campaign card only after the campaign hub exists.
- Review mobile chart labels, long category names, and dense dashboard stacking in browser QA.

### Transactions
Existing:
- Search by description/person/note, and filters for type, account, category, and month.
- Date-bounded CSV export.

Gaps:
- The From/To fields currently scope CSV export only; they do not filter the visible transaction list.
- No shared one-day / one-week / one-month / yearly filter control yet.
- Verify transfer, loan, reimbursement, and BNPL transaction labels and accessible grouping.

### Accounts
Existing:
- Create cash, bank, e-wallet, savings, and other accounts.
- Derived balances, opening-balance correction records, archive/unarchive.

Follow-up:
- Review archived-account visibility and actions.
- Test opening balance correction and account balance calculations with transfers and fees.

### Budgets
Existing:
- Monthly category budgets, custom expense categories, edit/delete, month navigation, spending progress.

Follow-up:
- Keep the BNPL monthly budget synchronized with the BNPL tracker without mixing BNPL obligations into ordinary category spending.
- Verify category archive behavior and duplicate-budget prevention.

### Loans
Existing:
- Track amounts lent, borrower, principal, repayments, outstanding balance, and settlement.
- Loan movements are described as non-income/non-expense.

Follow-up:
- Verify repayment edge cases and ensure receivables are not included in cash balances.
- Keep BNPL plans and reimbursement claims excluded from ordinary loans.

### Analysis
Existing:
- Month/year selector, income, expenses, net cash flow, savings rate, expense category share, monthly trend, and top categories.

Gaps:
- No one-day or one-week view.
- Week boundaries must be Monday through Sunday.
- The same date-filter semantics should be reused by Transactions where appropriate.
- Review chart readability and zero-income/zero-expense states.

### BNPL
Existing:
- Main Space-only BNPL view, create-plan flow, manually entered installment schedules, monthly commitment, remaining budget, total outstanding, and manual single-installment payment.
- Payment is not automatically inferred from due date.
- The plan dialog previews months that would exceed the BNPL budget.

Gaps:
- Provider-grouped payment flow is absent.
- Payment dialog does not support partial payments; it treats amounts above the scheduled amount as fees.
- Settings page does not currently expose the BNPL enable/disable switch or BNPL monthly budget editor, although underlying actions and data fields exist.
- Due-date editing action exists in the domain layer but needs UI review.
- No reminder engine or notification scheduling was found.
- Add a non-promotional Learn & Use Responsibly entry point only when the educational hub is ready.

### Spaces and categories
Existing:
- Create personal/managed spaces, rename, archive/unarchive, create categories, archive categories.
- Home overview shows managed funds for a selected Main Space.

Gaps / risks:
- Spaces are archived rather than permanently deleted. This differs from the requested delete capability and needs a safe data-impact design.
- Audit parent/child relationships, multiple Main Spaces, archived parents, and reimbursement spaces.
- Confirm managed-space views never expose personal Main Space records.
- Review category archive behavior where historical transactions still reference the category.

### Settings and sync
Existing:
- Account/session information, sync status, manual sync, conflict resolution, skipped-record quarantine, CSV export, JSON backup, additive restore.

Gaps:
- No persistent light/dark/system appearance selector.
- No BNPL enable/disable or combined monthly budget controls currently visible in Settings.
- Clarify guest/device-only backup and offline limitations in the UI.

### Authentication and app shell
Existing:
- Email/password, Google OAuth, and device-only guest mode.
- Desktop sidebar and mobile bottom navigation with a More sheet.
- Main/managed space picker and sync status.
- Root error and not-found states.

Follow-up:
- Test narrow phone widths, keyboard navigation, focus visibility, screen-reader labels, safe-area spacing, and dialogs.
- Verify navigation visibility and behavior when BNPL is disabled or a managed/reimbursement space is selected.

## 3. Design system and PWA findings

- Existing brand tokens are defined in `src/styles.css`: deep teal, teal, ocean, aqua, and ice.
- Manrope is the configured font family.
- The inspected stylesheet defines light-theme tokens and a Tailwind dark variant, but no dark-theme token override or persisted theme preference was found.
- Root metadata and app icons are present.
- `vite-plugin-pwa` is listed as a dependency, but the current Vite configuration does not configure it. README also records that no service worker is present and offline reload is not supported.
- No native Android APK/project is present; the app currently documents PWA installation only.

## 4. Financial logic and data-safety notes

- Amounts are stored as integer centavos.
- Account balances derive from transaction entries.
- Only entries marked as income/expense contribute to reports; transfer principal and loan movements are excluded.
- Transfer fees are modeled as expense entries.
- Local-first persistence and cloud sync are implemented, with conflict handling and additive backup restore.
- BNPL uses loan records plus linked purchase/payment transactions. Changes must preserve idempotency and avoid double-counting.
- Campaign publishing requires a trusted server-side administrator role and must not rely on client-side UI visibility.

## 5. Existing automated test inventory

The repository contains tests for routing, CSV export, sync, validation, privacy, remote error handling, BNPL actions/integration/domain logic, home charts, ledger logic, and quarantine recovery.

At audit time, GitHub reported no completed status checks for the baseline commit, and no CI workflow file was present. Tests, lint, type-check, and production build were not executed in a local checkout as part of this source-only audit. Treat runtime behavior and visual appearance as unverified until those checks run.

## 6. Recommended implementation order after audit

1. Establish automated CI so every implementation batch can be checked.
2. Add persistent light/dark/system theme support and complete design tokens.
3. Improve navigation and page-level UX without changing financial semantics.
4. Implement BNPL grouped payments and reminder scheduling.
5. Add consistent date filters to Analysis and Transactions.
6. Build Responsible BNPL Use with administrator-only publishing and regular-user reading/bookmark/quiz features.
7. Complete accessibility, performance, security, responsive, and end-to-end verification.
8. Build the first-time tutorial last.

## 7. Explicit non-goals for this audit

- No application code, database schema, or user data was changed.
- No migrations or deployment were performed.
- No campaign content was published.
- No production-readiness claim is made.

## 8. User-provided visual reference for the design-system phase

The user supplied a visual reference board on 2026-11-09. Treat it as direction for visual language, not as a replacement brand identity.

Direction to adapt to PocketVault's existing Protected Layers identity and supplied brand palette:

- **Illustrated dashboard:** richer, layered financial cards and floating data panels, but preserve legibility and avoid obscuring actual balances or controls.
- **Light mode:** warm or cool neutral canvas, clean card surfaces, subtle shadows, clear hierarchy, and restrained brand accents.
- **Dark mode:** deep navy/teal surfaces, layered teal gradients or abstract wave textures, and turquoise accents for primary actions and meaningful financial states. Maintain contrast for text and numeric data.
- **Financial illustrations:** a coherent 3D illustration family for wallets, cards, coins, savings, and payment concepts. Avoid mixing unrelated illustration styles.
- **Mobile-first composition:** compact app-like screens, clear bottom navigation, visible primary actions, and readable transaction rows.

Implementation constraints:
- Do not copy another product's logo, product name, exact screen layout, or proprietary artwork.
- Preserve PocketVault's chosen brand identity, palette, and Protected Layers concept.
- Use decorative gradients/illustrations sparingly in data-dense screens; financial data and accessible controls take priority.
- Build light/dark/system theme tokens and persistent user preference rather than hard-coding colors per component.
- Validate contrast, focus states, responsive layout, and chart readability in both themes before considering the design-system batch complete.

## 9. CI baseline and theme batch verification notes

The first CI attempt could not download Bun because the GitHub release endpoint returned HTTP 504. A retry successfully installed dependencies and ran the tests. The tests passed, but the repository-wide ESLint command failed with 688 Prettier formatting errors (and 12 warnings) across existing files, including unrelated routes and tests. This is pre-existing repository-wide formatting debt; do not apply a mass formatter as part of a focused feature batch.

After the dedicated formatting-cleanup batch was merged, CI runs repository-wide ESLint via `bun run lint`. This expands the lint check to the full repository; it does not itself establish that the full lint check passes.
