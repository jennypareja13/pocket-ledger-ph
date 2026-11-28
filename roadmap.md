# PocketVault roadmap and implementation status

Last reconciled: 2026-11-28  
Verified main baseline before PR 1: `236b29dfd518d3367a86c64f622d29502eac1dbf`

This document distinguishes merged repository code from database operations, manual configuration, and unverified deployment state. The owner's Master Brief remains the authority for product decisions.

## Recently completed implementation batches

The following changes are merged to `main`:

- BNPL reminder engine and unit tests (PR #8). The engine is not proof of operating-system or push notification delivery.
- BNPL even-split remainder handling (PR #9).
- Light as the default theme (PR #10).
- Lend and repayment dialog flow (PR #12).
- Reimbursement functionality removal (PR #13).
- BNPL purchase details in payment history (PR #24).
- BNPL in-app reminder panels (PR #25).
- Database grant and public default-privilege hardening migrations (PR #26). The owner reports that both migrations have been applied to the database. This document does not independently inspect the database. The migrations do not alter RLS policies, FORCE RLS, or the `push_record` function; see `docs/security/pr-a-database-hardening.md`.
- Offline app shell and service worker support (PR #27). **Opt-in only; default OFF.** Registration requires explicit local opt-in. This is not a claim that offline support is enabled for users.
- Privacy consent gate, privacy notice version `2026-11-v1`, and password reset flow (PR #28). Repository code is merged. Required Auth dashboard configuration and real-device verification are separate manual checks and are not confirmed here.

PR #28 is the current main commit at the baseline SHA above.

## Security completion plan

Security work is being delivered as six separate PRs, in order:

| PR | Scope | Current status |
|---|---|---|
| 1 | Repository hygiene: Dependabot, non-blocking dependency audit, pinned Bun, status documentation | In progress on `security/pr1-repo-hygiene` |
| 2 | Privacy notice v2, chart CSS injection hardening, error-report redaction review | Not started |
| 3 | Security response headers and CSP report-only policy | Not started; owner review required before merge |
| 4 | Explicit per-user local-data wipe with pending-sync safeguards | Not started; owner review required before merge |
| 5 | Service-worker exclusions for reset and consent routes | Not started; owner review required before merge |
| 6 | Server-side size/row limits and terminal sync rejection | Design first; two separate owner approvals required before implementation |

No migration for PR 6 is to be applied by this workflow. Claude applies any reviewed migration only after the owner approves it.

## Current security posture and known gaps

- **Database grants:** PR #26 is merged. The owner reports migrations 0002 and 0003 have been applied. PR #26 did not change RLS policies, enable FORCE RLS, change `push_record`, or revoke default function EXECUTE privileges. Do not describe this as complete database security.
- **Offline storage:** PR #27 is merged, but the service worker is opt-in and default OFF. The worker currently excludes `/auth` and backend/API paths; password-reset and privacy-notice route exclusions are scheduled for PR 5.
- **Consent and recovery:** PR #28 is merged with notice version `2026-11-v1`. PR 2 will deliberately move to `2026-11-v2`, prompting users with v1 consent again. Auth provider settings and real-device flows still need manual verification.
- **Local data deletion:** normal sign-out does not wipe the local ledger. A separate safe wipe is planned for PR 4 and must refuse to run when unsynced changes exist or the last sync failed.
- **Server-side abuse limits:** 16 KiB per-record and 10,000-row-per-owner limits are not implemented. PR 6 must first fix and test terminal rejection behavior in the sync layer.
- **Security headers:** not yet added. PR 3 will introduce the requested headers and report-only CSP.
- **Error telemetry redaction:** not yet confirmed. PR 2 begins with a read-only review of the reporting/capture paths.

## Product roadmap still outstanding

| Area | Status |
|---|---|
| Full visual/UI and accessibility QA | Source-level audit exists; full browser, device, keyboard, screen-reader, and accessibility verification remains outstanding |
| Design system, illustrations, backgrounds, dark mode | Partial theme foundation exists; full redesign and cross-page QA remain |
| Navigation and core page redesign | Not completed |
| BNPL payments/reminders | Reminder engine, panels, and payment-history item details merged; full end-to-end delivery and device QA remain |
| Day/week/month/year filters | Not verified as complete on main; PR #4 requires separate reconciliation |
| Responsible BNPL campaign hub | Specification only; not implemented |
| First-time tutorial | Not started; remains last |

## Guardrails

- One task, one backup branch, one feature branch, and one PR at a time. Never commit directly to `main`.
- PRs 1 and 2 may be self-merged only after CI passes on the exact PR head SHA. PRs 3–6 require the owner's explicit `approved` response after code review. PR 6 requires two approvals at its separate design and implementation gates.
- Do not apply database migrations. Claude applies reviewed migrations after owner review.
- Do not publish, deploy, or claim a feature is live based only on a merged PR.
- No new runtime dependencies. Do not upgrade packages in PR 1.
- Preserve strict TypeScript, integer-centavo accounting, Asia/Manila date semantics, and managed-space privacy.
- Do not modify `sync-engine.ts`, `store.ts`, or `remote.ts` except as specifically authorized in PR 6 after its design approval.
- Report CI only from observed GitHub Actions results for the exact head SHA.
