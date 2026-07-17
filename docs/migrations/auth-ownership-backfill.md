# Auth ownership backfill runbook

This is a controlled, one-owner data migration for the six existing financial tables. **Preparation and the structural migration do not include enforcement**: no foreign keys, `NOT NULL`, scoped category uniqueness, or production auth rollout is performed here. Do not create a real user until the controlled window.

## Quick path

1. Make the database backup verifiable and quiesce every API instance and writer.
2. Confirm the pending queue contains only the structural migration, then apply it.
3. Run the guarded backfill with an explicit target and audited counts.
4. Verify ownership and financial invariants; plan enforcement as a separate reviewed migration.

## 1. Preconditions and quiesced window

- Stop/quiesce the API, workers, importers, cron jobs, admin scripts, and every other writer **before both migration and backfill**. The advisory transaction lock is an additional defense, not a substitute for stopping writers.
- Confirm `NODE_ENV` is not `production`; this script rejects production unconditionally.
- Confirm the parsed PostgreSQL database name, host, and port equal `OWNERSHIP_BACKFILL_DATABASE_NAME`, `OWNERSHIP_BACKFILL_DATABASE_HOST`, and `OWNERSHIP_BACKFILL_DATABASE_PORT`; set `OWNERSHIP_BACKFILL_CONFIRM=local-finanzas-personales`. Never print `DATABASE_URL`, passwords, hashes, or credentials.
- Run `prisma migrate status` and inspect the pending list. **Abort if any pending migration differs from `20260715100000_auth_ownership_structure`**. `prisma migrate deploy` applies **all pending migrations**, not one named migration, so it is safe here only after this check and only when that is the sole pending migration. In this preparation there is no pending enforcement migration; enforcement remains a separate follow-up.

## 2. Verifiable backup

Create the backup through the approved secret manager/runtime injection. Verify both that the artifact exists and that it restores into an isolated database; an unverified dump is not a rollback plan.

```bash
pg_dump --format=custom --file=<backup-file> "<source-database-url>"
pg_restore --list "<backup-file>" > <backup-inventory-file>
pg_restore --exit-on-error --clean --if-exists --dbname=<isolated-database> "<backup-file>"
```

Do not include the source URL, password, or the backup contents in logs or committed files.

## 3. Structural migration only

The structural migration creates `users`, adds nullable `userId` columns, and adds quoted mixed-case indexes. Its preconditions inspect exact `pg_class`/`pg_namespace` names, including quoted mixed-case index names. It does not insert data or assign ownership; the nullable state is intentional.

```bash
pnpm --dir apps/api exec prisma migrate status
# Abort unless the only pending migration is 20260715100000_auth_ownership_structure.
pnpm --dir apps/api exec prisma migrate deploy
```

Review `prisma migrate status` and the SQL immediately before applying. Keep the enforcement migration out of this pending batch.

## 4. Backfill

Use a protected environment injection. `OWNERSHIP_EXPECTED_COUNTS` is mandatory and must contain all six keys; the script never assumes the example below. Historical documentation mentions 9 commitments, but the current audited snapshot for this database is 17 commitments. Re-audit the target immediately before the run:

```bash
# Audited current counts: accounts=8, categories=18, transactions=58,
# commitment_templates=8, commitments=17, goals=4.
OWNERSHIP_BACKFILL_CONFIRM=local-finanzas-personales \
OWNERSHIP_BACKFILL_DATABASE_NAME=finanzas_personales \
OWNERSHIP_BACKFILL_DATABASE_HOST=localhost \
OWNERSHIP_BACKFILL_DATABASE_PORT=5432 \
INITIAL_USER_EMAIL='<email-from-secret-manager>' \
INITIAL_USER_PASSWORD='<password-from-secret-manager>' \
OWNERSHIP_EXPECTED_COUNTS='{"accounts":8,"categories":18,"transactions":58,"commitment_templates":8,"commitments":17,"goals":4}' \
pnpm --dir apps/api exec tsx src/scripts/backfillOwnership.ts
```

The script takes a transaction-scoped PostgreSQL advisory lock, normalizes email with trim/lowercase, reuses exactly one equivalent user without changing its password hash by default, and aborts on duplicates. It is one-shot and idempotent for rows already owned by that user. Password rotation requires the explicit `INITIAL_USER_ROTATE_PASSWORD=true` switch.

## 5. Verification before enforcement

Verify all of the following in the same quiesced window:

- Each of the six table counts still equals the audited expected count, before and after the backfill.
- Every table has zero residual `NULL` `userId`, zero orphaned user references, and zero cross-user relationships through `accountId`, `categoryId`, `templateId`, `paymentTransactionId`, or goal account ownership.
- Every non-null `transferId` group has at most one non-null `userId`; abort if transactions sharing a transfer have different owners. Transfer rows, IDs, and amounts are preserved.
- There is exactly one user matching the normalized initial email.
- IDs, amounts, statuses, `paymentTransactionId`, transfer links, and all other financial columns are unchanged. In particular, the seven paid commitments without `paymentTransactionId` remain unchanged.
- Review the transaction/audit output without exposing credentials or hashes.

Do not alter states, amounts, payment links, or IDs as part of this operation.

## 6. Enforcement is a separate change

This preparation intentionally does **not** enforce ownership. Only after verification should a separately reviewed migration add `NOT NULL`, six foreign keys, and replace the global category-name uniqueness with `(userId, nombre)`. Review its SQL and pending queue separately; never bundle it implicitly with this structural migration.

## Rollback boundary

- Before backfill, stop all writers and restore the verified backup to a controlled replacement database if the structural result is unacceptable. In-place cleanup of the empty structural objects is allowed only after confirming no writer used them and after a reviewed dependency-safe plan.
- After a user or ownership assignment exists, do not drop `users` or the ownership columns. Preserve a fresh backup and restore the pre-migration backup to a controlled replacement database, or use a reviewed compensating migration. This preserves a realistic rollback boundary without pretending that deleting the new identity is harmless.
- A later enforcement migration can remove its constraints and return columns to nullable, but that does not undo ownership assignments.
- Never use `prisma migrate reset` as rollback.

## Separate follow-up

Do not change the existing `AUTH_COOKIE_SECURE` warning or production authentication in this migration work. HTTPS deployment hardening, including cookie enforcement in the production environment, is a separate follow-up.
