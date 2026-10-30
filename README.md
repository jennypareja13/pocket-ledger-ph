# PocketLedger

Private, offline-first personal finance ledger in Philippine pesos (PHP, Asia/Manila dates). The product name lives in `src/lib/config.ts`.

## Run locally
```
bun install
bun run dev     # http://localhost:8080
bun run test    # ledger, loan, space-isolation and sync tests
bun run build
```

## Accounts and sign-in
- **Signed in (email/password or Google):** data is stored on the device and synced to the cloud.
- **Guest / "Use on this device only":** data stays only in this browser's IndexedDB. Never uploaded; clearing site data deletes it.
- First sign-in needs internet; afterwards the saved session lets the app open offline.

## Data model
- Amounts are integer centavos. Every transaction stores derived `entries` (balance movements).
- Only entries flagged `report` count in income/expense. Transfer principal, lending and loan repayments never do; a transfer fee is a separate expense entry on the source account.
- Spaces (personal / managed, e.g. a sinking fund) are fully separate: accounts, categories, budgets, loans and totals are scoped to one space.

## Cloud schema and access rules
One table, `ledger_records` (id, owner_id, kind, space_id, data jsonb, deleted, rev, last_mutation_id, timestamps).
- Row-level security: signed-in users can select/insert/update/delete only rows where `owner_id = auth.uid()`. No anonymous access.
- `push_record(...)` (security invoker, so RLS applies) does idempotent, optimistic-concurrency upserts: a repeated `mutation_id` is a no-op; a stale `rev` returns a conflict instead of overwriting.
- Migration: `drizzle/migrations/0000_ledger_records.sql`.

## Sync
- Every edit is written to IndexedDB first and marked pending.
- When online, pending changes upload about 1 s after edits and every 30 s; then changes since the last cursor are downloaded.
- Retries are safe (same mutation id). Conflicts are never overwritten silently; you pick "keep mine" or "use cloud" in Settings.
- Deletes are soft deletes so they sync.

## Export, backup and restore (Settings)
- **Export transactions (CSV):** one row per transaction in all spaces: date, space, type, amount, fee, category, account, to_account, person, note, sync state. Amounts in pesos.
- **Download JSON backup:** every local record (spaces, accounts, categories, transactions, budgets, people, loans, including soft-deleted ones) without sync metadata, as `{ app, version: 1, exported_at, records }`.
- **Restore backup:** additive only. Records whose id already exists are left unchanged; new ones are added and queued for sync. Nothing is overwritten or deleted.

## Install on a phone (PWA)
Open the published site in Chrome (Android) → menu → **Add to Home screen**, or Safari (iOS) → Share → **Add to Home Screen**. A web manifest and icons are included.

## Known limitations
- No service worker yet: once the app has loaded it keeps working offline, but **opening or reloading it with no connection fails**. The app is rendered on the server and runs on Cloudflare Workers, and an offline cache for that setup hasn't been added or tested.
- No Android APK/native build exists. Capacitor packaging was assessed: the app has no server functions, so a static bundle is possible in principle, but this build setup did not produce a standalone `index.html`, and no Java/Android SDK/Gradle is available here. No Android project was added. Opening or reloading the website with no connection fails, because there's no service worker.
- Google sign-in uses a browser redirect that would not work inside an Android WebView; email/password would.
- Money you owe to others (payables) is not tracked; only loans you give.
- Cross-user isolation is enforced by database access rules and reviewed by reading them; there is no automated test that signs in as two real users.
- Recurring transactions and multi-currency are not built.
- Conflicts are resolved whole record at a time, not field by field.
