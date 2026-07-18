# Auth ownership backfill runbook

This is a controlled, one-owner data migration for the existing financial data. It assigns ownership to existing rows; it does not create a second copy of the data and it does not run the enforcement migration's backfill.

## Migration history and gate

There are three migrations in this historical sequence:

1. `20260715100000_auth_ownership_structure` — creates `users` and the nullable ownership columns/indexes for the six original financial tables. It is structural only; it does not create credentials or assign ownership.
2. `20260716100000_loans_receivable` — creates the Loans and loan repayments schema, including their ownership columns. It is structural only; it does not backfill or assign ownership.
3. `20260717100000_auth_ownership_enforcement` — validates the owned data and adds `NOT NULL`, owner/composite foreign keys, and scoped uniqueness. It contains **no backfill**.

For the current database, migrations 1 and 2 must already be `APPLIED`. Migration 3 must be the **only pending migration** before enforcement. If either historical migration is not applied, or if any other migration is pending, abort. Do not try to apply the structural migration again.

`prisma migrate deploy` applies the entire pending queue; it cannot select one migration by name. Therefore, never run it for the current database unless the queue contains exactly `20260717100000_auth_ownership_enforcement`.

## Current database: exact sequence

1. **Quiesce first.** Stop the API, workers, importers, cron jobs, admin scripts, and every other writer for the full backup, backfill, verification, and enforcement window.
2. **Take and verify a backup.** Confirm the backup exists and restore it into an isolated database. An unverified dump is not a rollback plan.
3. **Check preconditions without changing data.** Confirm `NODE_ENV` is not `production`; use protected runtime injection for `AUTH_JWT_SECRET`, `INITIAL_USER_EMAIL`, and the backfill controls; never print secrets, passwords, hashes, or database URLs. Confirm the target database identity matches the approved host, port, and name. Confirm Loans and the structural ownership objects exist.
4. **Inspect migration status.** Run `prisma migrate status` and inspect the complete queue. Abort unless `20260715100000_auth_ownership_structure` and `20260716100000_loans_receivable` are `APPLIED` and `20260717100000_auth_ownership_enforcement` is the only pending migration. If this exact state is not true, do not run `prisma migrate deploy`.
5. **Run the guarded backfill.** Provide an explicit initial user and audited expected counts. The backfill takes its transaction-scoped lock, creates or resolves exactly one initial user, and assigns existing rows. It must run while writers remain stopped.
6. **Verify exhaustively before enforcement.** Recheck counts, null/orphan/cross-owner conditions, transfer ownership consistency, initial-user uniqueness, and preservation of IDs, amounts, statuses, payment links, and other financial values.
7. **Recheck the queue.** Confirm the two historical migrations remain `APPLIED` and enforcement remains the only pending migration. Abort if anything changed or any additional migration is pending.
8. **Apply enforcement only.** Run `prisma migrate deploy` only after all previous gates pass. This applies the pending enforcement migration; it does not perform the backfill. Review its SQL and deployment output separately.

## New installations

For an empty new database, do not replay or manually recreate the structural migration. Use the repository migration history in order. After confirming the database is empty and the runtime configuration is valid, `prisma migrate deploy` may apply the complete pending queue—structural, Loans, and enforcement—because there are no pre-existing rows requiring ownership backfill. Create the initial/demo user and seed data only through the approved user-scoped seed path, after the schema is complete.

If a supposedly new installation contains any data, stop treating it as new and follow the current-database sequence above. Never use a seed, reset, import, or ad-hoc SQL operation to bypass the migration gate.

## Backup and quiescence

Create the backup through approved secret-manager/runtime injection and verify both its inventory and an isolated restore:

```bash
pg_dump --format=custom --file=<backup-file> "<source-database-url>"
pg_restore --list "<backup-file>" > <backup-inventory-file>
pg_restore --exit-on-error --clean --if-exists --dbname=<isolated-database> "<backup-file>"
```

Do not include source URLs, passwords, backup contents, or credentials in logs or committed files. The advisory backfill lock is an additional defense, not a substitute for stopping every writer.

## Backfill and verification requirements

`OWNERSHIP_EXPECTED_COUNTS` is mandatory and must contain all six original ownership tables: `accounts`, `categories`, `transactions`, `commitment_templates`, `commitments`, and `goals`. Re-audit counts immediately before the run; do not rely on historical examples.

Before enforcement, verify:

- Every original ownership table has zero residual `NULL` `userId` values and zero orphaned user references.
- Relationships through `accountId`, `categoryId`, `templateId`, `paymentTransactionId`, and goal account ownership do not cross users.
- Non-null `transferId` groups have one consistent owner; IDs, amounts, statuses, payment links, and all other financial values are unchanged.
- Exactly one user matches the normalized initial email.
- Loans and loan repayments satisfy their ownership and relationship invariants as applicable to the audited data.

Do not alter states, amounts, payment links, IDs, or unrelated financial fields during the backfill.

## Authentication configuration

- `AUTH_JWT_SECRET` is the final and only documented JWT secret variable. Inject a strong secret through the approved secret manager/runtime mechanism; never put a real secret in this repository or logs.
- `AUTH_COOKIE_SECURE=true` is mandatory for production/HTTPS. `false` is permitted only for local development or tests.
- The API enforces the production requirements, including a JWT secret of at least 32 characters. Do not use an insecure production default.

## Rollback boundary

- Before ownership assignment, restore the verified backup to a controlled replacement database if the structural result is unacceptable. Do not replay structural migrations against an already-structured database.
- After ownership assignment exists, do not drop `users` or ownership columns. Restore to a controlled replacement database or use a reviewed compensating migration.
- A later removal of enforcement constraints does not undo ownership assignments. Never use `prisma migrate reset` as rollback.

## Isolated integration testing

Integration tests must remain disabled unless every disposable-database guard passes. They must use a dedicated local database whose name ends in `_test` or `_integration`, an explicit integration URL, and a URL different from the application's `DATABASE_URL`. Do not run integration tests, migrations, DDL, seed, reset, import, or backfill as part of normal documentation/configuration verification.
