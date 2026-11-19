# PR A — Database grants and default-privilege hardening

## Scope and safety boundary

This PR contains exactly two SQL migrations. It changes database permissions only. It does not update, delete, rewrite, or migrate any existing row. It does not change RLS enablement, any RLS policy, `push_record()`, BNPL logic, or the offline sync implementation. It does not apply either migration to the live database.

Export your PocketVault data from the app before applying these migrations. The migrations do not rewrite rows, but a permission mistake can interrupt access or sync; the rollback SQL below is the safety net.

**Do not apply both files automatically without reviewing the pre-check output.** Apply them in numeric order, using the Lovable database connection only after a database backup and explicit approval.

## What each migration does

### `0002_restrict_ledger_feedback_grants.sql`

- Removes all direct privileges from `anon` on `ledger_records` and `feedback`.
- Removes any privileges granted to `PUBLIC` on those two tables.
- Removes `TRUNCATE`, `REFERENCES`, and `TRIGGER` from `authenticated` on both tables.
- Removes `UPDATE` and `DELETE` from `authenticated` on `feedback`.
- Leaves authenticated ledger SELECT/INSERT/UPDATE/DELETE and feedback SELECT/INSERT intact.
- Leaves `service_role` unchanged.
- Does not touch policies, RLS flags, `push_record()`, or the feedback trigger function.

Possible impact: any feature or external client incorrectly using the anonymous role to access these tables will stop working. That is intended: the app's user data paths should use authenticated sessions. Feedback remains insertable/readable according to its existing authenticated policies.

### `0003_restrict_public_default_privileges.sql`

- Removes default privileges for `anon` on future tables and sequences created by role `postgres` in schema `public`.
- Does not alter default function EXECUTE privileges for any role. This includes `PUBLIC EXECUTE` on future functions and the existing `anon` and `authenticated` function defaults.
- Intentionally leaves `authenticated` table and sequence default privileges unchanged. Removing them now could cause future Lovable-generated schema objects to stop working until explicit grants are added. This is the conservative compatibility choice, not a claim that all future objects will be safe automatically.
- Applies only to future tables and sequences created by `postgres` in `public`.

**PARTIAL protection, explicitly accepted:** `PUBLIC EXECUTE` on future functions remains unchanged; `anon` and `authenticated` default privileges on future functions remain unchanged; `authenticated` defaults on future tables and sequences remain unchanged; and all `supabase_admin` defaults remain unchanged. The live migration role is `postgres`, is not a superuser, and has neither membership nor USAGE rights for `supabase_admin`, so it cannot alter that role's defaults. This migration is not comprehensive default-privilege hardening.

This migration does not change existing objects. Future tables and sequences created by `postgres` no longer receive the `anon` default grants revoked here. Function defaults are not changed; all future functions still require explicit review of effective EXECUTE privileges. Lovable-generated schema changes may fail until the necessary grants are added. Every new public table still needs deliberate RLS enablement and policies.

## Deferred: PR F (not included here)

The 16 KiB per-row JSON limit and 10,000-row per-owner cap are deferred. They must be implemented together with a dedicated, tested terminal-rejection path in the sync layer. The current sync code marks a rejected push as `sync = "error"` and includes error records in later upload queues, so a SQL constraint/trigger rejection can be retried on every sync. PR F must:
1. define and test a terminal rejected state that is not automatically re-uploaded;
2. preserve the rejected local record and give the user a clear, recoverable explanation;
3. prove that a corrected record can be retried intentionally;
4. test both SQLSTATE classification and repeated sync behavior;
5. only then add the 16 KiB row-size check and 10,000-row cap, counting soft-deleted tombstones.

Reason for deferral: legitimate PocketVault records are a few hundred bytes (largest observed: 570 bytes) and the largest observed owner has 54 rows. The proposed limits are intended to deter deliberate abuse of an account. Opening the sync engine of a real-finance app during the thesis deadline is not justified by the current observed data. This leaves a known server-side size/count-abuse gap until PR F; it is an explicit risk accepted for this phase, not a claim that those limits are already enforced.

## Live values audited before this PR

Database identity: `current_user = postgres`, `session_user = postgres`, `rolsuper = false`, `pg_has_role(postgres, supabase_admin, MEMBER) = false`, and `USAGE = false`.

Existing table ACLs (both tables):
`{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres}`

Both tables had RLS enabled and FORCE RLS disabled.

Existing policies:
- `ledger_records`: `own select`, `own insert`, `own update`, `own delete`, all for `authenticated`.
- `feedback`: `submit own feedback` (INSERT) and `read own feedback or trusted admin` (SELECT), both for `authenticated`.

Existing `push_record(uuid,text,uuid,jsonb,boolean,integer,uuid)` ACL:
`{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

Existing default ACLs for `postgres` in `public`:
- tables: `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres}`
- sequences: `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres,sandbox_exec=rU/postgres}`
- functions: `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`

The `supabase_admin` default ACLs also grant broad privileges to `anon` and `authenticated`; they remain unchanged because the current migration role cannot alter them.

## Pre-apply checks (read-only)

Run these before either migration. Stop if the results do not match the audited values below.

### 1. Confirm migration identity and privileges

```sql
SELECT
  current_user,
  session_user,
  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
  pg_has_role(current_user, 'supabase_admin', 'MEMBER') AS supabase_admin_member,
  pg_has_role(current_user, 'supabase_admin', 'USAGE') AS supabase_admin_usage;
```

Expected: `postgres`, `postgres`, `false`, `false`, `false`.

### 2. Confirm existing table ACLs and RLS flags

```sql
SELECT
  c.relname,
  c.relacl::text AS table_acl,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ledger_records', 'feedback')
ORDER BY c.relname;
```

Expected for both tables: ACL exactly as recorded above, `rls_enabled = true`, `force_rls = false`.

### 3. Confirm current RLS policies

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ledger_records', 'feedback')
ORDER BY tablename, policyname;
```

Expected: the six policy rows and definitions listed in the live-values section. Save this output for the post-apply comparison.

### 4. Confirm push_record ACL

```sql
SELECT p.oid::regprocedure::text AS function_name, p.proacl::text AS function_acl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'push_record';
```

Expected ACL: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

### 5. Confirm default ACLs for both object-creating roles

```sql
SELECT
  d.defaclrole::regrole::text AS owner_role,
  d.defaclnamespace::regnamespace::text AS schema_name,
  d.defaclobjtype AS object_type,
  d.defaclacl::text AS default_acl
FROM pg_default_acl d
WHERE d.defaclnamespace = 'public'::regnamespace
  AND d.defaclrole IN ('postgres'::regrole, 'supabase_admin'::regrole)
ORDER BY owner_role, object_type;
```

Expected: the six exact raw ACL strings recorded above. If any differ, stop and regenerate the rollback before applying.

## Post-apply verification

### 1. Effective table privileges

```sql
SELECT
  role_name,
  table_name,
  has_table_privilege(role_name, table_name, 'SELECT') AS can_select,
  has_table_privilege(role_name, table_name, 'INSERT') AS can_insert,
  has_table_privilege(role_name, table_name, 'UPDATE') AS can_update,
  has_table_privilege(role_name, table_name, 'DELETE') AS can_delete,
  has_table_privilege(role_name, table_name, 'TRUNCATE') AS can_truncate,
  has_table_privilege(role_name, table_name, 'REFERENCES') AS can_references,
  has_table_privilege(role_name, table_name, 'TRIGGER') AS can_trigger
FROM (VALUES
  ('anon', 'public.ledger_records'),
  ('anon', 'public.feedback'),
  ('authenticated', 'public.ledger_records'),
  ('authenticated', 'public.feedback')
) AS checks(role_name, table_name)
ORDER BY role_name, table_name;
```

Expected:
- `anon`: all seven values false for both tables.
- `authenticated / ledger_records`: SELECT, INSERT, UPDATE, DELETE true; TRUNCATE, REFERENCES, TRIGGER false.
- `authenticated / feedback`: SELECT, INSERT true; UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER false.

### 2. Confirm policies and RLS flags

Re-run pre-checks 2 and 3. The six policy rows and their definitions must be unchanged; both tables must still have RLS enabled and FORCE RLS disabled.

### 3. Confirm push_record unchanged

Re-run pre-check 4. The function ACL must remain exactly `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.

### 4. Confirm default ACLs

```sql
SELECT
  d.defaclrole::regrole::text AS owner_role,
  d.defaclnamespace::regnamespace::text AS schema_name,
  d.defaclobjtype AS object_type,
  d.defaclacl::text AS default_acl
FROM pg_default_acl d
WHERE d.defaclnamespace = 'public'::regnamespace
  AND d.defaclrole IN ('postgres'::regrole, 'supabase_admin'::regrole)
ORDER BY owner_role, object_type;
```

Expected for `postgres`:
- tables: `{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres}`
- sequences: `{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres,sandbox_exec=rU/postgres}`
- functions: unchanged from the pre-check, including the existing `anon` and `authenticated` defaults. `PUBLIC EXECUTE` remains governed by PostgreSQL's built-in default.

Expected for `supabase_admin`: all three ACL strings unchanged from the pre-check.

## Rollback SQL

Only run rollback if verification fails or the app smoke test reveals a regression. Run the rollback corresponding to the migration that was applied. These statements restore the exact ACL entries observed before this PR; they do not restore any unrelated changes made after the pre-check.

### Roll back `0002_restrict_ledger_feedback_grants.sql`

```sql
GRANT ALL PRIVILEGES ON TABLE public.ledger_records TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.feedback TO anon, authenticated;
```

Before this PR, both tables granted all table privileges (`arwdDxtm`) to anon and authenticated. PUBLIC had no explicit ACL entry. Service-role, owner, and sandbox_exec entries were not changed.

### Roll back `0003_restrict_public_default_privileges.sql`

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO anon;

```

No function default privileges were changed, so there is no function rollback statement. No `supabase_admin` defaults were changed. These rollback statements restore the previous anon table and sequence entries while preserving authenticated, service_role, sandbox_exec, and owner entries.

## Manual smoke test after applying

Use a test transaction/account if possible. Do not use a record you cannot afford to lose.

1. On Device A, sign in with the normal authenticated account.
2. Create a small test transaction and wait for sync to finish.
3. Confirm the transaction appears in the app with no sync error.
4. Edit the transaction, save, wait for sync, and confirm the updated value remains.
5. Delete the test transaction, wait for sync, and confirm it is deleted.
6. Sign out normally.
7. On Device B, sign in to the same account and confirm the transaction's final deleted state is reflected (it should not reappear).
8. On Device A or B, create a small BNPL purchase with a future installment.
9. Mark one installment paid using a valid account/date/amount.
10. Confirm the installment is marked paid, the corresponding payment transaction appears, and there are no sync errors.
11. If any action fails or a sync error appears, stop testing and use the saved pre-apply outputs to diagnose. Do not repeatedly retry a failing mutation.

## Known risks and limits

- Anonymous direct access to the two tables will be removed. Any legitimate anonymous feature depending on it would break; the current app is expected to use authenticated access.
- Default privileges are only partially hardened: anon defaults are revoked for future tables and sequences created by `postgres` in `public`.
- `PUBLIC EXECUTE` and anon/authenticated defaults for future functions remain unchanged. Authenticated defaults for future tables and sequences also remain unchanged.
- All `supabase_admin` defaults remain unchanged. New tables still need RLS and reviewed grants/policies.
- Lovable-generated future schema changes may need explicit GRANT statements after the default-privilege change.
- The 16 KiB row limit and 10,000-row cap are not implemented in this PR. They remain deferred to PR F with the terminal-rejection sync fix.
- No live migration has been applied as part of this PR.
