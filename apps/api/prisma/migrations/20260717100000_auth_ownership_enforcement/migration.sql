-- Enforcement phase only. This migration validates the audited ownership state,
-- then adds database-level owner isolation without changing any row data.

DO $$
DECLARE
    _table TEXT;
BEGIN
    FOREACH _table IN ARRAY ARRAY[
        'users', 'accounts', 'categories', 'transactions',
        'commitment_templates', 'commitments', 'goals', 'loans', 'loan_repayments'
    ] LOOP
        IF to_regclass(format('public.%I', _table)) IS NULL THEN
            RAISE EXCEPTION 'Auth ownership enforcement precondition failed: expected table public.% is missing', _table;
        END IF;
    END LOOP;
END
$$;

DO $$
DECLARE
    _table TEXT;
BEGIN
    FOREACH _table IN ARRAY ARRAY[
        'accounts', 'categories', 'transactions',
        'commitment_templates', 'commitments', 'goals'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = _table
              AND column_name = 'userId'
              AND is_nullable = 'NO'
        ) THEN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = _table
                  AND column_name = 'userId'
            ) THEN
                -- Nullability is deliberately enforced below, after the data checks.
                NULL;
            ELSE
                RAISE EXCEPTION 'Auth ownership enforcement precondition failed: %.userId is missing', _table;
            END IF;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraint_row
            JOIN pg_catalog.pg_class AS table_row ON table_row.oid = constraint_row.conrelid
            JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = table_row.relnamespace
            WHERE namespace_row.nspname = 'public'
              AND table_row.relname = _table
              AND constraint_row.contype = 'f'
              AND constraint_row.conname LIKE _table || '_userId_fkey'
        ) THEN
            RAISE EXCEPTION 'Auth ownership enforcement precondition failed: %.userId owner FK already exists', _table;
        END IF;
    END LOOP;

END
$$;

DO $$
DECLARE
    expected_constraint TEXT;
    expected_table TEXT;
    expected_referenced_table TEXT;
    expected_columns TEXT[];
    expected_referenced_columns TEXT[];
    constraint_oid OID;
    actual_columns TEXT[];
    actual_referenced_columns TEXT[];
    constraint_definition TEXT;
BEGIN
    -- Loans were already enforced by the immediately preceding migration. Do not
    -- rewrite those FKs in this migration; validate their complete definition so
    -- ownership enforcement cannot proceed against a drifted Loans schema.
    FOR expected_constraint, expected_table, expected_referenced_table,
        expected_columns, expected_referenced_columns IN
        SELECT * FROM (VALUES
            ('loans_userId_fkey', 'loans', 'users', ARRAY['userId']::TEXT[], ARRAY['id']::TEXT[]),
            ('loans_entregaTransactionId_fkey', 'loans', 'transactions', ARRAY['entregaTransactionId', 'userId']::TEXT[], ARRAY['id', 'userId']::TEXT[]),
            ('loan_repayments_userId_fkey', 'loan_repayments', 'users', ARRAY['userId']::TEXT[], ARRAY['id']::TEXT[]),
            ('loan_repayments_loanId_fkey', 'loan_repayments', 'loans', ARRAY['loanId', 'userId']::TEXT[], ARRAY['id', 'userId']::TEXT[]),
            ('loan_repayments_transactionId_fkey', 'loan_repayments', 'transactions', ARRAY['transactionId', 'userId']::TEXT[], ARRAY['id', 'userId']::TEXT[])
        ) AS expected(name, table_name, referenced_table_name, columns, referenced_columns)
    LOOP
        SELECT constraint_row.oid,
               ARRAY(
                   SELECT attribute.attname
                   FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, position)
                   JOIN pg_catalog.pg_attribute AS attribute
                     ON attribute.attrelid = constraint_row.conrelid
                    AND attribute.attnum = key.attnum
                   ORDER BY key.position
               ),
               ARRAY(
                   SELECT attribute.attname
                   FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key(attnum, position)
                   JOIN pg_catalog.pg_attribute AS attribute
                     ON attribute.attrelid = constraint_row.confrelid
                    AND attribute.attnum = key.attnum
                   ORDER BY key.position
               ),
               pg_catalog.pg_get_constraintdef(constraint_row.oid)
          INTO constraint_oid, actual_columns, actual_referenced_columns, constraint_definition
          FROM pg_catalog.pg_constraint AS constraint_row
          JOIN pg_catalog.pg_class AS local_table ON local_table.oid = constraint_row.conrelid
          JOIN pg_catalog.pg_namespace AS local_namespace ON local_namespace.oid = local_table.relnamespace
          JOIN pg_catalog.pg_class AS referenced_table ON referenced_table.oid = constraint_row.confrelid
          JOIN pg_catalog.pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced_table.relnamespace
         WHERE constraint_row.conname = expected_constraint
           AND constraint_row.contype = 'f'
           AND local_namespace.nspname = 'public'
           AND local_table.relname = expected_table
           AND referenced_namespace.nspname = 'public'
           AND referenced_table.relname = expected_referenced_table;

        IF constraint_oid IS NULL
           OR actual_columns <> expected_columns
           OR actual_referenced_columns <> expected_referenced_columns
           OR constraint_definition !~* 'ON DELETE RESTRICT'
           OR constraint_definition !~* 'ON UPDATE CASCADE'
           OR constraint_definition ~* 'ON DELETE CASCADE'
           OR constraint_definition ~* 'ON UPDATE RESTRICT' THEN
            RAISE EXCEPTION 'Auth ownership enforcement precondition failed: Loans constraint % has an unexpected definition', expected_constraint;
        END IF;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "accounts" WHERE "userId" IS NULL)
       OR EXISTS (SELECT 1 FROM "categories" WHERE "userId" IS NULL)
       OR EXISTS (SELECT 1 FROM "transactions" WHERE "userId" IS NULL)
       OR EXISTS (SELECT 1 FROM "commitment_templates" WHERE "userId" IS NULL)
       OR EXISTS (SELECT 1 FROM "commitments" WHERE "userId" IS NULL)
       OR EXISTS (SELECT 1 FROM "goals" WHERE "userId" IS NULL) THEN
        RAISE EXCEPTION 'Auth ownership enforcement precondition failed: legacy userId contains NULL';
    END IF;

    IF EXISTS (SELECT 1 FROM "accounts" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId"))
       OR EXISTS (SELECT 1 FROM "categories" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId"))
       OR EXISTS (SELECT 1 FROM "transactions" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId"))
       OR EXISTS (SELECT 1 FROM "commitment_templates" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId"))
       OR EXISTS (SELECT 1 FROM "commitments" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId"))
       OR EXISTS (SELECT 1 FROM "goals" row_data WHERE NOT EXISTS (SELECT 1 FROM "users" owner WHERE owner."id" = row_data."userId")) THEN
        RAISE EXCEPTION 'Auth ownership enforcement precondition failed: legacy userId references a missing user';
    END IF;

    IF EXISTS (
        SELECT "userId", "nombre"
        FROM "categories"
        GROUP BY "userId", "nombre"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Auth ownership enforcement precondition failed: duplicate scoped category names';
    END IF;

    IF EXISTS (SELECT 1 FROM "transactions" transaction_row JOIN "accounts" account_row ON account_row."id" = transaction_row."accountId" WHERE account_row."userId" <> transaction_row."userId")
       OR EXISTS (SELECT 1 FROM "transactions" transaction_row JOIN "categories" category_row ON category_row."id" = transaction_row."categoryId" WHERE transaction_row."categoryId" IS NOT NULL AND category_row."userId" <> transaction_row."userId")
       OR EXISTS (SELECT 1 FROM "goals" goal_row JOIN "accounts" account_row ON account_row."id" = goal_row."accountId" WHERE account_row."userId" <> goal_row."userId")
       OR EXISTS (SELECT 1 FROM "commitments" commitment_row JOIN "commitment_templates" template_row ON template_row."id" = commitment_row."templateId" WHERE commitment_row."templateId" IS NOT NULL AND template_row."userId" <> commitment_row."userId")
       OR EXISTS (SELECT 1 FROM "commitments" commitment_row JOIN "transactions" transaction_row ON transaction_row."id" = commitment_row."paymentTransactionId" WHERE commitment_row."paymentTransactionId" IS NOT NULL AND transaction_row."userId" <> commitment_row."userId") THEN
        RAISE EXCEPTION 'Auth ownership enforcement precondition failed: cross-owner relationship detected';
    END IF;

    IF EXISTS (
        SELECT "transferId"
        FROM "transactions"
        WHERE "transferId" IS NOT NULL
        GROUP BY "transferId"
        HAVING COUNT(DISTINCT "userId") > 1
    ) THEN
        RAISE EXCEPTION 'Auth ownership enforcement precondition failed: transfer group has multiple owners';
    END IF;
END
$$;

CREATE UNIQUE INDEX "accounts_id_userId_key" ON "accounts"("id", "userId");
CREATE UNIQUE INDEX "categories_id_userId_key" ON "categories"("id", "userId");
CREATE UNIQUE INDEX "commitment_templates_id_userId_key" ON "commitment_templates"("id", "userId");
CREATE UNIQUE INDEX "commitments_id_userId_key" ON "commitments"("id", "userId");
CREATE UNIQUE INDEX "goals_id_userId_key" ON "goals"("id", "userId");
CREATE UNIQUE INDEX "commitments_paymentTransactionId_userId_key" ON "commitments"("paymentTransactionId", "userId");

DROP INDEX "categories_nombre_key";
CREATE UNIQUE INDEX "categories_userId_nombre_key" ON "categories"("userId", "nombre");

ALTER TABLE "accounts" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "commitment_templates" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "commitments" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_accountId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_categoryId_fkey";
ALTER TABLE "goals" DROP CONSTRAINT "goals_accountId_fkey";
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_templateId_fkey";
ALTER TABLE "commitments" DROP CONSTRAINT "commitments_paymentTransactionId_fkey";

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commitment_templates" ADD CONSTRAINT "commitment_templates_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_userId_fkey"
  FOREIGN KEY ("accountId", "userId") REFERENCES "accounts"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_categoryId_userId_fkey"
  FOREIGN KEY ("categoryId", "userId") REFERENCES "categories"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_accountId_userId_fkey"
  FOREIGN KEY ("accountId", "userId") REFERENCES "accounts"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_templateId_userId_fkey"
  FOREIGN KEY ("templateId", "userId") REFERENCES "commitment_templates"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_paymentTransactionId_userId_fkey"
  FOREIGN KEY ("paymentTransactionId", "userId") REFERENCES "transactions"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
