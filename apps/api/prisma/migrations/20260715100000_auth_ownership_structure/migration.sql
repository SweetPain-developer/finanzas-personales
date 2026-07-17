-- Structural phase only. This migration must not create credentials or assign ownership.

DO $$
DECLARE
    expected_table TEXT;
    ownership_table TEXT;
BEGIN
    FOREACH expected_table IN ARRAY ARRAY[
        'accounts',
        'categories',
        'transactions',
        'commitment_templates',
        'commitments',
        'goals'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class AS relation
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = expected_table
              AND relation.relkind IN ('r', 'p')
        ) THEN
            RAISE EXCEPTION 'Auth ownership precondition failed: expected table public.% is missing', expected_table;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relname = 'users'
    ) THEN
        RAISE EXCEPTION 'Auth ownership precondition failed: public.users already exists';
    END IF;

    FOREACH ownership_table IN ARRAY ARRAY[
        'accounts',
        'categories',
        'transactions',
        'commitment_templates',
        'commitments',
        'goals'
    ] LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ownership_table
              AND column_name = 'userId'
        ) THEN
            RAISE EXCEPTION 'Auth ownership precondition failed: %.userId already exists', ownership_table;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind = 'i'
          AND relation.relname IN (
              'accounts_userId_idx', 'categories_userId_idx', 'transactions_userId_idx',
              'commitment_templates_userId_idx', 'commitments_userId_idx', 'goals_userId_idx'
          )
    ) THEN
        RAISE EXCEPTION 'Auth ownership precondition failed: a userId index already exists';
    END IF;
END
$$;

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email")
);

ALTER TABLE "accounts" ADD COLUMN "userId" TEXT;
ALTER TABLE "categories" ADD COLUMN "userId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "userId" TEXT;
ALTER TABLE "commitment_templates" ADD COLUMN "userId" TEXT;
ALTER TABLE "commitments" ADD COLUMN "userId" TEXT;
ALTER TABLE "goals" ADD COLUMN "userId" TEXT;

CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX "categories_userId_idx" ON "categories"("userId");
CREATE INDEX "transactions_userId_idx" ON "transactions"("userId");
CREATE INDEX "commitment_templates_userId_idx" ON "commitment_templates"("userId");
CREATE INDEX "commitments_userId_idx" ON "commitments"("userId");
CREATE INDEX "goals_userId_idx" ON "goals"("userId");
