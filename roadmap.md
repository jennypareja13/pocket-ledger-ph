# PocketVault implementation
- [x] Batch A part 2: atomic BNPL actions, strict calendar validation, 103 passing tests, changed-file ESLint, automatic build OK; manual typecheck/build not executed under workspace rules
- [x] Batch 2: quarantine/error prechecks, Home/Spaces privacy, ordinary-loan lists, 49 passing tests, ESLint and desktop/mobile checks; manual strict/production commands unavailable under workspace execution rules
- [ ] Brand, navigation, home and child-space scoping
- [ ] Budget manager, analysis and scoped CSV export
- [ ] Optional reimbursements and BNPL
- [ ] Private feedback, policy review and isolation verification
- [ ] Tests, desktop/mobile checks and documentation

## Campaign hub publishing requirements

PocketVault administrators only may create, edit, schedule, publish, unpublish, or archive Responsible BNPL Use campaigns. Regular users may only browse published campaigns. Enforce administrator permissions on the server using a trusted role; client-side hiding is not authorization. Draft, scheduled, and archived campaigns must not appear in the user feed. No public comments or user-submitted campaigns in the initial release. See `.lovable/spec/responsible-bnpl-campaign-hub.md`.
