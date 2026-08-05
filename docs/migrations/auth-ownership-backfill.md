# Runbook de backfill y enforcement de auth/ownership

This is a controlled, one-owner data migration for the existing financial data. It assigns ownership to existing rows; it does not create a second copy of the data and it does not run the enforcement migration's backfill.

## Migration history and gate

Hay cuatro migraciones relevantes en esta secuencia histórica:

1. `20260715100000_auth_ownership_structure` — crea `users` y las columnas/índices de ownership nullable para las seis tablas financieras originales. Es estructural; no crea credenciales ni asigna ownership.
2. `20260716100000_loans_receivable` — crea el schema de Loans y devoluciones, incluidas sus columnas de ownership. Es estructural; no hace backfill ni asigna ownership.
3. `20260717100000_auth_ownership_enforcement` — valida los datos con ownership y agrega `NOT NULL`, FKs owner-scoped/composite y unicidad scoped. No contiene backfill.
4. `20260801100000_session_revocation` — agrega `sessionVersion` para permitir la revocación de sesiones. No contiene backfill de ownership.

Para una base existente antes del enforcement, las migraciones 1 y 2 deben estar `APPLIED`; las migraciones 3 y 4 son la cola aprobada que puede permanecer pendiente. No se exige que enforcement sea la única pendiente: sí se exige que no haya ninguna migración pendiente fuera de esa cola aprobada. Esta secuencia ya fue aplicada y verificada localmente; no se declara aplicación en una base remota. Si el estado no coincide en otro destino, abortar.

`prisma migrate deploy` aplica toda la cola pendiente; no selecciona una migración por nombre. Por eso, nunca ejecutarlo para una base existente salvo que la cola contenga únicamente migraciones aprobadas: `20260717100000_auth_ownership_enforcement` y, cuando corresponda, `20260801100000_session_revocation`.

## Current database: exact sequence

1. **Quiesce first.** Stop the API, workers, importers, cron jobs, admin scripts, and every other writer for the full backup, backfill, verification, and enforcement window.
2. **Take and verify a backup.** Confirm the backup exists and restore it into an isolated database. An unverified dump is not a rollback plan.
3. **Check preconditions without changing data.** Confirm `NODE_ENV` is not `production`; use protected runtime injection for `AUTH_JWT_SECRET`, `INITIAL_USER_EMAIL`, and the backfill controls; never print secrets, passwords, hashes, or database URLs. Confirm the target database identity matches the approved host, port, and name. Confirm Loans and the structural ownership objects exist.
4. **Inspect migration status.** Run `prisma migrate status` and inspect the complete queue. Abort unless `20260715100000_auth_ownership_structure` and `20260716100000_loans_receivable` are `APPLIED`, `20260717100000_auth_ownership_enforcement` remains pending for this run, and every other pending migration is one of the approved queue items (`20260801100000_session_revocation` may also be pending). If this guarded state is not true, do not run `prisma migrate deploy`.
5. **Run the guarded backfill.** Provide an explicit initial user and audited expected counts. The backfill takes its transaction-scoped lock, creates or resolves exactly one initial user, and assigns existing rows. It must run while writers remain stopped.
6. **Verify exhaustively before enforcement.** Recheck counts, null/orphan/cross-owner conditions, transfer ownership consistency, initial-user uniqueness, and preservation of IDs, amounts, statuses, payment links, and other financial values.
7. **Recheck the queue.** Confirm the two historical migrations remain `APPLIED`, enforcement remains pending, and the only other allowed pending item is `20260801100000_session_revocation`. Abort if anything changed or any additional migration is pending.
8. **Apply the approved queue.** Run `prisma migrate deploy` only after all previous gates pass. This applies the pending enforcement and, when present, session-revocation migration; it does not perform the backfill. Review each SQL file and the deployment output separately.

## Instalaciones nuevas

Para una instalación nueva, no recrear manualmente migraciones estructurales ni asumir un atajo. Usar la historia del repositorio en orden y mantener el runbook secuencial: confirmar base objetivo, backup, quiescence, estado vacío, configuración, backfill/validaciones de ownership según corresponda y recién después enforcement. El hecho de que sea una base nueva no autoriza declarar aplicado el enforcement en un destino remoto.

Si una instalación supuestamente nueva contiene datos, dejar de tratarla como nueva y seguir la secuencia de base existente. Nunca usar seed, reset, importación ni SQL ad hoc para saltar el gate de migración.

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
