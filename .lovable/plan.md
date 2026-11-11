# PocketVault — current implementation status and next phases

Last reconciled: 2026-11-11  
Verified main commit: `e9deee599c1710b6caed5ab9eea253056c7ce6bf`

The owner's `POCKETVAULT_MASTER_BRIEF_FOR_CHATGPT.md` is the authoritative product specification. This plan replaces the earlier staged plan's stale branch assumptions and blocking questions. It reports what is merged to `main`; open PRs and feature branches are not treated as completed work.

## 1. Verified Git and CI state

- `main` is at `e9deee599c1710b6caed5ab9eea253056c7ce6bf`.
- Task 4 (remove reimbursements) was merged in [PR #13](https://github.com/jennypareja13/pocket-ledger-ph/pull/13). Its resulting tree matched the expected tree SHA `0f4c9d0d530f50ef28c8a71c84a18badc89f1ba2`.
- PR #13's PR-head CI run `42931164232` succeeded. The push-triggered CI run for the resulting main commit, `42931298319`, also succeeded. Both ran the workflow job "Test, lint, type-check, and build".
- The pre-Task-4 backup branch `backup/pre-task4-2026-11-10` remains at `c3d42729084486033b33ec78f6083ca8ee85fac8`.
- PR #3 (even-split remainder) and PR #4 (BNPL settings/date-range foundation) are still open. PR #3 duplicates work already delivered by merged PR #9. PR #4 is based on an older main commit and must be reviewed/reconciled separately.

## 2. Completed implementation batches on main

- BNPL reminder engine and unit tests (PR #8). This is pure reminder logic; do not assume the reminder UI, browser notification delivery, push delivery, or service-worker integration is complete.
- Even-split remainder placement, with extra centavos assigned to the final installment(s) (PR #9).
- Light as the default theme (PR #10). Full visual redesign and all-page light/dark/system QA remain separate work.
- Lend and repayment dialog flow (PR #12).
- Reimbursement feature removal (PR #13): reimbursement transaction fields and UI were removed; validation rejects legacy reimbursement transaction records and unsupported space-purpose values. The old reimbursement feature must not be reintroduced without a new explicit product decision.

## 3. Remaining work, in approved order

1. **UI/UX audit and design preparation:** source-level audit exists. Complete visual/browser, mobile, keyboard, screen-reader, contrast, and accessibility verification as part of the later design and QA work.
2. **Design system, illustrations, backgrounds, and dark mode:** visual redesign remains a separate Lovable phase, but no Lovable build is authorized by this status document. Wait for the owner's explicit phase approval and preserve the Protected Layers identity and approved palette.
3. **Navigation and core page redesign:** propose the information architecture first; do not implement before approval.
4. **BNPL grouped payments and reminders:** reminder engine exists and is tested. Still assess/build provider-grouped payments and connect reminders to the approved in-app experience. Do not add OS/push notifications or a service worker without separate approval.
5. **Financial data filters:** day, Monday–Sunday week, month, and year filters shared by Home, Activity, Analysis, and CSV export are not yet verified as merged to main. PR #4 contains date-range foundation work but is open.
6. **Responsible BNPL campaign hub:** specification exists on `add-responsible-bnpl-campaign-spec`, not on main. Any campaign tables, RLS, trusted admin role, storage, or migration require explicit approval before implementation or application.
7. **Testing, accessibility, performance, and security:** CI is running successfully on the latest main commit. Remaining manual and end-to-end checks must be performed and reported separately; CI success alone does not establish production readiness.
8. **First-time tutorial:** last, only after all other phases and the campaign hub have been implemented and tested.

## 4. Working constraints

- GitHub-first. Do not trigger Lovable builds for code or documentation work. Reserve Lovable credits for the separately approved visual/UI phase.
- One branch and one PR per task. Never commit directly to main or merge without the owner's explicit authorization.
- Verify exact existing content before edits. Keep diffs within the requested scope and list every changed file.
- Never weaken strict TypeScript flags. Money remains integer centavos; dates remain Asia/Manila calendar dates.
- Preserve Main Space / managed-space privacy and never automatically mark BNPL installments paid.
- No migrations, RLS/auth changes, new dependencies, IndexedDB version changes, destructive data changes, publishing, or deployment without explicit approval.
- Report checks as executed-and-passed, executed-and-failed, or not executed based on observed GitHub Actions results.

## 5. Open pull requests

- [PR #3 — Fix BNPL even-split remainder placement](https://github.com/jennypareja13/pocket-ledger-ph/pull/3): still open, but the corresponding change is already in merged PR #9. Review as stale/duplicate; do not merge blindly.
- [PR #4 — BNPL settings and date-range foundation](https://github.com/jennypareja13/pocket-ledger-ph/pull/4): still open, based on an older main commit. Review its diff and reconcile against current main before merging or closing.
- `add-responsible-bnpl-campaign-spec`: campaign specification branch only; not merged.

