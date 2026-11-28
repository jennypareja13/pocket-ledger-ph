# PocketVault — implementation status and security completion plan

Last reconciled: 2026-11-28  
Verified main baseline before this docs follow-up: `bec73c677493e43b5dac61ce7d2ebb3fb133eb81`

This plan reports merged repository code separately from database application, manual configuration, and deployment. The owner's Master Brief remains the authority for product decisions.

## 1. Verified Git state

- `main` baseline: `bec73c677493e43b5dac61ce7d2ebb3fb133eb81`.
- PRs #24, #25, #26, #27, #28, #29, and #30 are merged.
- PR #30 is the current main commit at the baseline above.
- The GitHub status check currently displayed for the CI job is **`Test, lint, type-check, and build`**.
- PR #26 contains migrations `0002_restrict_ledger_feedback_grants.sql` and `0003_restrict_public_default_privileges.sql`. The owner reports both were applied to the database; this repository check does not independently verify database state.
- PR #27 adds a handwritten service worker and opt-in registration. Offline support remains **default OFF**.
- PR #28 adds the privacy consent gate and password reset flow. PR #30 updates the privacy notice to `2026-11-v2`. Required Auth dashboard configuration and real-device verification have not been confirmed in this plan.

## 2. Completed work on main

- PR #24: BNPL purchase details appear in payment history.
- PR #25: BNPL in-app reminder panels.
- PR #26: database grants and public default-privilege hardening. It removes anonymous direct table grants and selected excessive grants, and revokes anonymous defaults for future public tables/sequences created by postgres. It does not change RLS policies, FORCE RLS, `push_record`, or default function EXECUTE privileges. Review `docs/security/pr-a-database-hardening.md`.
- PR #27: offline service worker, bounded app-shell/assets cache, explicit opt-in, update prompt, and emergency disable path. The app does not register the worker unless the user opts in; default remains OFF.
- PR #28: consent gate, original privacy notice version `2026-11-v1`, and password recovery route with an eight-character client-side minimum.
- PR #29: weekly Dependabot updates, Bun pinned to 1.4.5, and a non-blocking dependency audit. The audit reported 30 findings (1 critical, 14 high, 14 moderate, 1 low); no packages were upgraded.
- PR #30: privacy notice version `2026-11-v2` with pinned SHA-256; chart CSS ID/key/color validation; error redaction before logging and Lovable telemetry.

Earlier merged product work remains: PR #8 reminder schedule engine, PR #9 even-split remainder, PR #10 Light default, PR #12 lend/repayment flow, and PR #13 reimbursement removal.

## 3. Security work sequence

1. **PR 1 — Repository hygiene:** completed and merged as PR #29.
2. **PR 2 — Small hardening:** completed and merged as PR #30. The exact notice text is pinned to SHA-256 `344eaf0214229df2f30241439f0e7c29e9b37a437efc00fa94acae201c660d58`. Existing v1 consent no longer matches the current version. Chart style inputs are allowlisted. Project-owned error reporting/logging wrappers redact long digit runs, email-like strings, and URL query values.
3. **PR 3 — Security headers:** response headers, enforced frame-ancestors compatible with Lovable preview, and report-only CSP. Wait for owner approval after full code review.
4. **PR 4 — Local data wipe:** separate explicit destructive action, confirmation, and safeguards that block wiping if unsynced pending changes exist or the last sync failed. Normal sign-out remains unchanged. Wait for owner approval.
5. **PR 5 — Service-worker exclusions:** exclude password reset, privacy notice, and relevant auth/consent routes. Default OFF remains unchanged. Wait for owner approval.
6. **PR 6 — Server-side limits and safe sync rejection:** design report first, then wait for approval; implementation and unapplied migration files only after a second approval. Claude applies migrations after review.

## 4. Known gaps and deferred work

- Database size and per-owner row caps are not implemented. PR 6 addresses these only after a terminal-rejection design prevents permanent server rejections from retrying forever.
- Safe local wipe is not implemented. Do not manually delete IndexedDB as a workaround for unsynced data.
- Security headers and CSP are not implemented yet.
- Service-worker exclusions for `/reset-password` and `/privacy-notice` are pending PR 5.
- The current privacy notice is `2026-11-v2`. Accounts with v1 consent should be prompted to accept v2. Auth dashboard settings and real-device consent/recovery tests are not verified here.
- The dependency audit findings from PR #29 require a separate remediation PR, prioritizing the critical `shell-quote` advisory and then high-severity findings.
- Offline support remains opt-in and default OFF.
- Full visual/accessibility QA, navigation redesign, date-range filters, campaign hub implementation, and tutorial remain separate product work. The tutorial remains last.

## 5. Operating rules

- GitHub-first; one PR at a time. Create a backup branch and feature branch from the current main before each PR.
- PR 1 and PR 2 may be self-merged only after successful CI on the exact head SHA. PRs 3–6 must remain open until the owner writes `approved` after reviewing the complete printed code. PR 6 requires approval after the design report and a second approval before implementation.
- No direct commits to main, no new runtime dependencies, no package upgrades in PR 1, no publishing/deployment claims, and no live database migrations.
- Claude applies migrations after owner review.
- Preserve strict TypeScript, integer centavos, Asia/Manila dates, and managed-space privacy.
- Do not modify `src/lib/sync-engine.ts`, `store.ts`, or `remote.ts` before the PR 6 design approval.
