# PocketVault roadmap and implementation status

Last reconciled: 2026-11-11  
Verified main commit: `e9deee599c1710b6caed5ab9eea253056c7ce6bf`

This document tracks the approved roadmap in `.lovable/north-star/north-star.md` and the owner's Master Brief. The Master Brief is the authoritative source for product decisions. This status reflects code merged to `main`, not work that exists only in an open pull request or a planning document.

## Recently completed implementation batches

The following implementation batches have been merged to `main`:

- BNPL reminder engine: pure reminder-schedule logic and unit tests (PR #8). This is the engine, not evidence that reminders are already delivered through a connected UI or operating-system notification service.
- BNPL even-split remainder: leftover centavos go to the final installment(s) (PR #9).
- Default theme: Light is the default theme (PR #10). This alone does not establish that every page, chart, dialog, and illustration has completed visual/theme QA.
- Lend and repayment dialog flow (PR #12).
- Removal of reimbursement functionality (PR #13). Reimbursement-specific transaction fields and UI were removed; legacy reimbursement records and unsupported purpose values are rejected by validation.

PR #13 was merged at `e9deee599c1710b6caed5ab9eea253056c7ce6bf`. Its PR-head CI and the push-triggered CI on this main commit both completed successfully. See the linked GitHub checks for the exact run details.

## Approved roadmap status

| Phase | Approved work | Status on verified main |
|---|---|---|
| 1 | Full UI/UX audit | Source-level audit document exists. Live browser, visual, accessibility, and device QA are not thereby complete. |
| 2 | Design system, illustrations, backgrounds, dark mode | Brand tokens and theme work exist; default Light was set in PR #10. The full approved visual redesign and cross-page QA remain outstanding. |
| 3 | Navigation and core page redesign | Not completed. The information architecture and page-group redesign still require the owner's approval before implementation. |
| 4 | BNPL grouped payments and reminders | Reminder engine is merged and unit-tested. Provider-grouped payment UI/logic and full reminder UI/delivery integration remain outstanding. |
| 5 | Financial data filters (day, week, month, year) | Not merged to main. PR #4 contains date-range foundation work but remains open and is not part of the verified main commit. |
| 6 | Responsible BNPL campaign hub and management | Specification exists on the separate `add-responsible-bnpl-campaign-spec` branch. It is not merged or implemented. Database/RLS/admin-role work remains blocked pending explicit approval. |
| 7 | Testing, accessibility, performance and security | CI runs on main and the latest main run succeeded. This is not a substitute for the remaining responsive, accessibility, security, performance, and real-user isolation verification. |
| 8 | First-time user tutorial | Not started. It must remain last, after all other phases are implemented and tested. |

## Open pull requests requiring separate review

- [PR #3 — Fix BNPL even-split remainder placement](https://github.com/jennypareja13/pocket-ledger-ph/pull/3) remains open. The corresponding even-split task has already been delivered through merged PR #9; review PR #3 as a stale/duplicate branch before taking any action.
- [PR #4 — BNPL settings and date-range foundation](https://github.com/jennypareja13/pocket-ledger-ph/pull/4) remains open and is based on an older main commit. Do not assume its changes are present on main. Review and reconcile it separately before merging or closing it.
- The campaign specification branch is documentation-only and is not a merged feature.

## Guardrails

- GitHub-first; do not trigger Lovable builds for repository implementation or documentation tasks. Lovable is reserved for a separately approved visual/UI phase.
- One task, one branch, one PR. Never commit directly to main or merge without the owner's explicit authorization.
- Preserve strict TypeScript settings, integer-centavo accounting, Asia/Manila date semantics, managed-space privacy, and manual-only BNPL payment marking.
- No database migrations, RLS/auth changes, new dependencies, IndexedDB version changes, or destructive data operations without explicit approval.
- Do not claim tests or checks passed unless the corresponding GitHub Actions result was inspected.
- Keep the first-time tutorial as the final roadmap phase.
