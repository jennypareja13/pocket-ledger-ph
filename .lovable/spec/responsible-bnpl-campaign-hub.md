# Responsible BNPL Use campaign hub

## Product purpose

Provide PocketVault users with practical, non-promotional financial education about using buy now, pay later (BNPL) services responsibly. The hub is educational; it must not encourage additional borrowing, promote BNPL providers, or imply that installment purchases are automatically affordable.

## Publishing and access model

**PocketVault administrators only may create, edit, schedule, publish, unpublish, or archive campaigns.**

- Regular users have read-only access to published campaigns.
- Regular users cannot create, edit, submit, approve, or publish campaign content.
- Campaign management controls must be protected by server-side authorization using a trusted administrator role. Hiding controls in the UI is not sufficient.
- Never infer administrator status from a client-side flag or user-editable profile field.
- Draft and scheduled content must not be visible to ordinary users.
- Published campaigns are shared educational content, not personal financial records, and must not expose one user's private ledger data to another.
- Do not add public comments or user-generated campaign publishing in the initial version.

## User-facing experience

Add a dedicated **Responsible BNPL Use** hub, discoverable from the BNPL area (for example, as a “Learn & Use Responsibly” tab or section). A small optional featured-campaign card may appear on Home without displacing core balance and cash-flow information.

Users may:
- Browse currently published campaigns.
- Open and read campaign materials.
- View infographics, illustrations, articles, and short videos where supported.
- Complete optional knowledge checks or quizzes.
- Save/bookmark a campaign for later, if this can be done without compromising offline-first behavior or data privacy.

The hub should have clear empty, loading, and error states. Archived, draft, and scheduled campaigns must not appear in the public list.

## Initial campaign topics

- Think Before You Buy: needs versus wants, affordability, impulse purchasing, and total purchase cost.
- Understand Your Installments: repayment schedules, due dates, fees, missed payments, and consequences.
- Know Your Limits: monthly obligations, debt accumulation, budget capacity, and warning signs of overextension.
- Protect Your Financial Well-being: recognizing financial strain and finding appropriate support.

Topics are examples and may be expanded by administrators.

## Campaign content model

Each campaign should support:
- Title and short summary.
- Cover illustration or media asset with accessible alternative text.
- Topic/category and optional tags.
- Body content with structured sections.
- Optional infographic, video, downloadable resource, or knowledge check.
- Publication status: Draft, Scheduled, Published, Archived.
- Created/updated metadata and publication/expiration dates.
- Content source/reference notes for administrator review.

Do not present unverified financial, legal, or provider-specific claims as facts. Content involving fees, penalties, consumer rights, or regulatory requirements must be reviewed against current authoritative sources before publication. Show relevant dates and sources where appropriate.

## Editorial and safety principles

- Educational, balanced, and non-promotional tone.
- Do not advertise providers or use affiliate links.
- Do not shame users for borrowing or being unable to pay.
- Do not present BNPL as universally good or bad; explain risks, costs, and context.
- Do not provide personalized credit, legal, or debt advice through generic campaign content.
- Avoid misleading urgency, manipulative engagement mechanics, or rewards that encourage borrowing.
- Use accessible language, readable contrast, captions/transcripts for video, and alt text for meaningful images.

## Administration workflow

Administrators can create and save drafts, preview content, edit drafts, schedule publication, publish, unpublish, and archive campaigns. Record who made publication changes and when. Require a confirmation for publish/unpublish/archive actions. Ordinary users must never see administrator controls.

## Non-goals for the initial release

- User-submitted campaigns.
- Public comments, likes, or discussion threads.
- Provider advertising or affiliate promotions.
- Personalized borrowing recommendations.
- Any automated changes to a user's BNPL plans, payments, budgets, or ledger records.

## Acceptance criteria

1. Only authenticated users with a trusted administrator role can access campaign-management actions; authorization is enforced server-side.
2. A regular user can view published campaigns but cannot create, edit, schedule, publish, unpublish, or archive them, including by directly calling the underlying API.
3. Draft, scheduled, and archived campaigns are not exposed in the ordinary user's published campaign feed.
4. Administrators can manage the full campaign lifecycle and preview content before publication.
5. Campaign content is clearly educational and non-promotional, with sources/review notes available to administrators.
6. The hub works responsively in light and dark themes and provides accessible loading, empty, and error states.
7. Campaign browsing does not modify BNPL plans, installments, account balances, expenses, budgets, or other financial records.
8. Tests cover role-based authorization, publication visibility, lifecycle transitions, and the separation of campaign content from personal financial data.
9. The feature is tested before the first-time user tutorial is authored or implemented, so onboarding reflects the final behavior.
