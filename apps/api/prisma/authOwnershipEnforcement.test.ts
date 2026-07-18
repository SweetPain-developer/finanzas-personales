import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationDir = join(currentDir, "migrations/20260717100000_auth_ownership_enforcement");
const migration = readFileSync(join(migrationDir, "migration.sql"), "utf8");
const integrationRunner = readFileSync(join(currentDir, "../src/integration/authOwnershipPostgres.integration.test.ts"), "utf8");

describe("auth ownership enforcement migration", () => {
  it("runs after the applied Loans migration", () => {
    const migrations = readdirSync(join(currentDir, "migrations"))
      .filter((entry) => /^\d+_/.test(entry))
      .sort();

    expect(migrations.indexOf("20260717100000_auth_ownership_enforcement")).toBeGreaterThan(
      migrations.indexOf("20260716100000_loans_receivable"),
    );
  });

  it("guards ownership completeness and relationship integrity before DDL", () => {
    expect(migration).toMatch(/RAISE EXCEPTION/i);
    for (const table of ["accounts", "categories", "transactions", "commitment_templates", "commitments", "goals"]) {
      expect(migration).toContain(`FROM "${table}"`);
      expect(migration).toMatch(new RegExp(`"${table}"[\\s\\S]*?userId`));
    }
    expect(migration).toMatch(/categories[\s\S]*GROUP BY[\s\S]*userId[\s\S]*nombre[\s\S]*HAVING COUNT\(\*\) > 1/i);
    expect(migration).toMatch(/transactions[\s\S]*accountId[\s\S]*userId[\s\S]*accounts[\s\S]*userId/i);
    expect(migration).toMatch(/transactions[\s\S]*categoryId[\s\S]*userId[\s\S]*categories[\s\S]*userId/i);
    expect(migration).toMatch(/goals[\s\S]*accountId[\s\S]*userId[\s\S]*accounts[\s\S]*userId/i);
    expect(migration).toMatch(/commitments[\s\S]*templateId[\s\S]*userId[\s\S]*commitment_templates[\s\S]*userId/i);
    expect(migration).toMatch(/commitments[\s\S]*paymentTransactionId[\s\S]*userId[\s\S]*transactions[\s\S]*userId/i);
    expect(migration).toMatch(/transferId[\s\S]*COUNT\(DISTINCT "userId"\)[\s\S]*> 1/i);
  });

  it("creates scoped parent keys and replaces legacy uniqueness", () => {
    for (const table of ["accounts", "categories", "commitment_templates", "commitments", "goals"]) {
      expect(migration).toContain(`CREATE UNIQUE INDEX "${table}_id_userId_key" ON "${table}"("id", "userId")`);
    }
    expect(migration).not.toContain('CREATE UNIQUE INDEX "transactions_id_userId_key"');
    expect(migration).toContain('DROP INDEX "categories_nombre_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "categories_userId_nombre_key" ON "categories"("userId", "nombre")');
    expect(migration).toContain('CREATE UNIQUE INDEX "commitments_paymentTransactionId_userId_key" ON "commitments"("paymentTransactionId", "userId")');
  });

  it("runs the integration migration with an isolated temporary Prisma config", () => {
    expect(integrationRunner).toContain('"--config", join(tempPrismaRoot, "prisma.config.ts")');
    expect(integrationRunner).toContain('schema: "./schema.prisma"');
    expect(integrationRunner).toContain('path: "./migrations"');
    expect(integrationRunner).toContain("url: process.env.DATABASE_URL!");
    expect(integrationRunner).not.toContain('"--schema"');
    expect(integrationRunner).not.toContain('CREATE UNIQUE INDEX "transactions_id_userId_key"');
  });

  it("makes legacy ownership required and adds restricted owner FKs", () => {
    for (const table of ["accounts", "categories", "transactions", "commitment_templates", "commitments", "goals"]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ALTER COLUMN "userId" SET NOT NULL`);
      expect(migration).toContain(`CONSTRAINT "${table}_userId_fkey"`);
      expect(migration).toContain(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_userId_fkey"`);
      expect(migration).toMatch(new RegExp(`CONSTRAINT "${table}_userId_fkey"[\\s\\S]*?FOREIGN KEY \\(\"userId\"\\) REFERENCES \"users\"\\(\"id\"\\)[\\s\\S]*?ON DELETE RESTRICT[\\s\\S]*?ON UPDATE CASCADE`));
    }
    expect(migration).not.toContain("ON DELETE SET NULL");
    for (const constraint of [
      "transactions_accountId_userId_fkey",
      "transactions_categoryId_userId_fkey",
      "goals_accountId_userId_fkey",
      "commitments_templateId_userId_fkey",
      "commitments_paymentTransactionId_userId_fkey",
    ]) {
      expect(migration).toContain(`CONSTRAINT "${constraint}"`);
      expect(migration).toMatch(new RegExp(`CONSTRAINT "${constraint}"[\\s\\S]*?ON DELETE RESTRICT[\\s\\S]*?ON UPDATE CASCADE`));
    }
    expect(migration).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });

  it("validates existing Loans FKs by relation, exact columns, and actions", () => {
    expect(migration).toContain("pg_catalog.pg_constraint");
    expect(migration).toContain("constraint_row.conrelid");
    expect(migration).toContain("constraint_row.confrelid");
    expect(migration).toContain("pg_catalog.pg_get_constraintdef(constraint_row.oid)");
    for (const constraint of [
      "loans_userId_fkey",
      "loans_entregaTransactionId_fkey",
      "loan_repayments_userId_fkey",
      "loan_repayments_loanId_fkey",
      "loan_repayments_transactionId_fkey",
    ]) {
      expect(migration).toContain(`'${constraint}'`);
    }
    expect(migration).toMatch(/ON DELETE RESTRICT/);
    expect(migration).toMatch(/ON UPDATE CASCADE/);
    expect(migration).toMatch(/ON DELETE CASCADE/);
  });
});
