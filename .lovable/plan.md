# PocketVault — implementation status and security completion plan

Last reconciled: 2026-11-28  
Verified main baseline before PR 2: `e8872ac3ff2114fa214793e1abf06de523963253`

This plan reports merged repository code separately from database application, manual configuration, and deployment. The owner's Master Brief remains the authority for product decisions.

## 1. Verified Git state

- `main` baseline: `236b29dfd518d3367a86c64f622d29502eac1dbf`.
- PRs #24, #25, #26, #27, and #28 are merged.
- PR #28 is the current main commit at the baseline above.
- The GitHub status check currently displayed for the CI job is **`Test, lint, type-check, and build`**. PR 1 will retain this job name for branch-protection compatibility.
- PR #26 contains migrations `0002_restrict_ledger_feedback_grants.sql` and `0003_restrict_public_default_privileges.sql`. The owner reports both were applied to the database; this repository check does not independently verify database state.
- PR #27 adds a handwritten service worker and opt-in registration. Offline support remains **default OFF**.
- PR #28 adds the privacy consent gate, v1 notice, and password reset flow. Required Auth dashboard configuration and real-device verification have not been confirmed in this plan.

## 2. Completed work on main

- PR #24: BNPL purchase details appear in payment history.
- PR #25: BNPL in-app reminder panels.
- PR #26: database grants and public default-privilege hardening. It removes anonymous direct table grants and selected excessive grants, and revokes anonymous defaults for future public tables/sequences created by postgres. It does not change RLS policies, FORCE RLS, `push_record`, or default function EXECUTE privileges. Review `docs/security/pr-a-database-hardening.md`.
- PR #27: offline service worker, bounded app-shell/assets cache, explicit opt-in, update prompt, and emergency disable path. The app does not register the worker unless the user opts in; default remains OFF.
- PR #28: consent gate, versioned privacy notice `2026-11-v1`, and password recovery route with an eight-character client-side minimum. Server-side password policy and redirect allowlist still require manual Auth configuration unless separately verified.

Earlier merged product work remains: PR #8 reminder schedule engine, PR #9 even-split remainder, PR #10 Light default, PR #12 lend/repayment flow, and PR #13 reimbursement removal.

## 3. Security work sequence

1. **PR 1 — Repository hygiene:** completed and merged as PR #29. Weekly Dependabot updates, non-blocking `bun audit`, Bun pinned to 1.4.5, and corrected status documents. The one-time audit reported 30 vulnerabilities (1 critical, 14 high, 14 moderate, 1 low); no packages were upgraded.
2. **PR 2 — Small hardening:** exact privacy notice v2 and version/hash updates; allowlist validation for chart CSS values and chart IDs before style injection; read-only inspection of error reporting/capture and redaction only if safe.
3. **PR 3 — Security headers:** response headers, enforced frame-ancestors compatible with Lovable preview, and report-only CSP. Wait for owner approval after full code review.
4. **PR 4 — Local data wipe:** separate explicit destructive action, confirmation, and safeguards that block wiping if unsynced pending changes exist or the last sync failed. Normal sign-out remains unchanged. Wait for owner approval.
5. **PR 5 — Service-worker exclusions:** exclude password reset, privacy notice, and relevant auth/consent routes. Default OFF remains unchanged. Wait for owner approval.
6. **PR 6 — Server-side limits and safe sync rejection:** design report first, then wait for approval; implementation and unapplied migration files only after a second approval. Claude applies migrations after review.

## 4. Known gaps and deferred work

- Database size and per-owner row caps are not implemented. PR 6 addresses these only after a terminal-rejection design prevents permanent server rejections from retrying forever.
- Safe local wipe is not implemented. Do not manually delete IndexedDB as a workaround for unsynced data.
- Security headers and CSP are not implemented yet.
- Service-worker exclusions for `/reset-password` and `/privacy-notice` are pending PR 5.
- Privacy notice v1 remains the main-branch notice until PR 2 is reviewed and merged. PR 2 changes the version to `2026-11-v2` to require renewed consent.
- The dependency audit findings from PR #29 require a separate remediation PR, prioritizing the critical `shell-quote` advisory and then high-severity findings.
- Auth dashboard settings and real-device consent/recovery tests are not verified here.
- Offline support remains opt-in and default OFF.
- Full visual/accessibility QA, navigation redesign, date-range filters, campaign hub implementation, and tutorial remain separate product work. The tutorial remains last.

## 5. Operating rules

- GitHub-first; one PR at a time. Create a backup branch and feature branch from the current main before each PR.
- PR 1 and PR 2 may be self-merged only after successful CI on the exact head SHA. PRs 3–6 must remain open until the owner writes `approved` after reviewing the complete printed code. PR 6 requires approval after the design report and a second approval before implementation.
- No direct commits to main, no new runtime dependencies, no package upgrades in PR 1, no publishing/deployment claims, and no live database migrations.
- Claude applies migrations after owner review.
- Preserve strict TypeScript, integer centavos, Asia/Manila dates, and managed-space privacy.
- Do not modify `src/lib/sync-engine.ts`, `store.ts`, or `remote.ts` before the PR 6 design approval.
