import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(currentDir, "../..");
const prismaRoot = join(apiRoot, "prisma");
const migrationsRoot = join(prismaRoot, "migrations");
const enforcementMigration = "20260717100000_auth_ownership_enforcement";

function normalizeDatabaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  url.protocol = "postgresql:";
  url.hostname = url.hostname.toLowerCase();
  if (url.port === "5432") url.port = "";
  url.pathname = decodeURIComponent(url.pathname);
  return url.toString();
}

function getSafeIntegrationUrl(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.RUN_POSTGRES_INTEGRATION !== "true" ||
    env.INTEGRATION_DATABASE_IS_EPHEMERAL !== "true" ||
    env.INTEGRATION_DATABASE_CONFIRM !== "finanzas-personales-ephemeral"
  ) return;

  const rawUrl = env.INTEGRATION_DATABASE_URL;
  const expectedName = env.INTEGRATION_DATABASE_NAME?.trim();
  const expectedPort = env.INTEGRATION_DATABASE_PORT?.trim();
  if (!rawUrl || !expectedName || !expectedPort) return;

  let integration: URL;
  let application: string | undefined;
  try {
    integration = new URL(rawUrl);
    if (!/^postgres(?:ql)?:$/.test(integration.protocol)) return;
    if (!integration.port || !["localhost", "127.0.0.1"].includes(integration.hostname.toLowerCase())) return;
    if (!/^\d+$/.test(expectedPort) || Number(integration.port) !== Number(expectedPort)) return;

    const databaseName = decodeURIComponent(integration.pathname.replace(/^\//, "")).trim();
    if (!/(?:_test|_integration)$/.test(databaseName) || databaseName !== expectedName) return;

    if (env.DATABASE_URL) application = normalizeDatabaseUrl(env.DATABASE_URL);
    if (application && normalizeDatabaseUrl(rawUrl) === application) return;
  } catch {
    return;
  }

  return rawUrl;
}

const integrationUrl = getSafeIntegrationUrl();
const integrationEnabled = Boolean(integrationUrl);

function runMigrations(tempPrismaRoot: string, url: string) {
  execFileSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--config", join(tempPrismaRoot, "prisma.config.ts")],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
    },
  );
}

describe.skipIf(!integrationEnabled)("PostgreSQL auth ownership enforcement", () => {
  let prisma: PrismaClient;
  let temporaryPrismaRoot: string;

  beforeAll(async () => {
    if (!integrationUrl) return;

    temporaryPrismaRoot = mkdtempSync(join(tmpdir(), "finanzas-postgres-integration-"));
    cpSync(join(prismaRoot, "schema.prisma"), join(temporaryPrismaRoot, "schema.prisma"));
    cpSync(migrationsRoot, join(temporaryPrismaRoot, "migrations"), { recursive: true });
    writeFileSync(
      join(temporaryPrismaRoot, "prisma.config.ts"),
      `import { defineConfig } from "prisma/config";\n\nexport default defineConfig({\n  schema: "./schema.prisma",\n  migrations: { path: "./migrations" },\n  datasource: { url: process.env.DATABASE_URL! },\n});\n`,
    );
    rmSync(join(temporaryPrismaRoot, "migrations", enforcementMigration), { recursive: true });

    // Phase 1: deploy only the structural queue item. The test database must be
    // ephemeral and dedicated; it never falls back to DATABASE_URL.
    runMigrations(temporaryPrismaRoot, integrationUrl);
    prisma = new PrismaClient({ datasources: { db: { url: integrationUrl } } });

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "users" ("id", "email", "passwordHash", "createdAt", "updatedAt") VALUES
        (${"user-a"}, ${"integration-a@example.test"}, ${"synthetic-hash-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${"user-b"}, ${"integration-b@example.test"}, ${"synthetic-hash-b"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "accounts" ("id", "nombre", "tipo", "saldo", "activa", "orden", "createdAt", "updatedAt", "userId") VALUES
        (${"account-a"}, ${"A account"}, ${"OPERATIVA"}::"AccountType", ${1000}, ${true}, ${0}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}),
        (${"account-b"}, ${"B account"}, ${"OPERATIVA"}::"AccountType", ${1000}, ${true}, ${0}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "categories" ("id", "nombre", "icono", "tipo", "orden", "userId") VALUES
        (${"category-a"}, ${"Food"}, ${"food"}, ${"GASTO"}::"CategoryType", ${0}, ${"user-a"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "transactions" ("id", "tipo", "monto", "descripcion", "fecha", "createdAt", "updatedAt", "userId", "accountId", "categoryId") VALUES
        (${"transaction-a"}, ${"GASTO"}::"TransactionType", ${100}, ${"Loan delivery"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"account-a"}, ${"category-a"}),
        (${"transaction-b"}, ${"GASTO"}::"TransactionType", ${50}, ${"B transaction"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"}, ${"account-b"}, NULL),
        (${"transaction-repayment"}, ${"INGRESO"}::"TransactionType", ${25}, ${"Loan repayment"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"account-a"}, NULL)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "commitment_templates" ("id", "nombre", "tipo", "montoDefault", "activa", "createdAt", "updatedAt", "userId") VALUES
        (${"template-a"}, ${"Internet"}, ${"RECURRENTE"}::"CommitmentType", ${50}, ${true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "commitments" ("id", "nombre", "tipo", "monto", "estado", "mes", "anio", "createdAt", "updatedAt", "userId", "templateId", "paymentTransactionId") VALUES
        (${"commitment-a"}, ${"Internet July"}, ${"RECURRENTE"}::"CommitmentType", ${50}, ${"PENDIENTE"}::"CommitmentStatus", ${7}, ${2026}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"template-a"}, NULL)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "goals" ("id", "nombre", "montoObjetivo", "estado", "accountId", "createdAt", "updatedAt", "userId") VALUES
        (${"goal-a"}, ${"Emergency"}, ${5000}, ${"ACTIVA"}::"GoalStatus", ${"account-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "loans" ("id", "persona", "montoEntregado", "estado", "notas", "entregaTransactionId", "userId", "createdAt", "updatedAt") VALUES
        (${"loan-a"}, ${"Synthetic person"}, ${100}, ${"PENDIENTE"}::"LoanStatus", NULL, ${"transaction-a"}, ${"user-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "loan_repayments" ("id", "monto", "loanId", "transactionId", "userId", "createdAt", "updatedAt") VALUES
        (${"repayment-a"}, ${25}, ${"loan-a"}, ${"transaction-repayment"}, ${"user-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // Phase 2: backfill is represented by the synthetic userId assignments above;
    // the real runbook requires the guarded production backfill before this phase.
    cpSync(join(migrationsRoot, enforcementMigration), join(temporaryPrismaRoot, "migrations", enforcementMigration), {
      recursive: true,
    });
    runMigrations(temporaryPrismaRoot, integrationUrl);
  });

  afterAll(async () => {
    if (prisma) {
      for (const table of [
        "loan_repayments",
        "loans",
        "commitments",
        "goals",
        "transactions",
        "commitment_templates",
        "categories",
        "accounts",
        "users",
      ]) {
        await prisma.$executeRaw(Prisma.raw(`DELETE FROM "${table}"`));
      }
      await prisma.$disconnect();
    }
    if (temporaryPrismaRoot) {
      rmSync(temporaryPrismaRoot, { recursive: true, force: true });
    }
  });

  it("enforces owner-scoped relationships, uniqueness, loans, and restrictive deletion", async () => {
    const categoryB = await prisma.category.create({
      data: { id: "category-b", nombre: "Food", icono: "food", tipo: "GASTO", orden: 0, userId: "user-b" },
    });
    expect(categoryB.userId).toBe("user-b");

    await expect(
      prisma.category.create({
        data: { id: "category-a-duplicate", nombre: "Food", icono: "food", tipo: "GASTO", orden: 0, userId: "user-a" },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.transaction.create({
        data: {
          id: "cross-owner-transaction",
          tipo: "GASTO",
          monto: 10,
          descripcion: "Cross owner",
          userId: "user-a",
          accountId: "account-b",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.loan.create({
        data: {
          id: "cross-owner-loan",
          persona: "Invalid",
          montoEntregado: 10,
          entregaTransactionId: "transaction-b",
          userId: "user-a",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.loanRepayment.create({
        data: {
          id: "cross-owner-repayment",
          monto: 10,
          loanId: "loan-a",
          transactionId: "transaction-b",
          userId: "user-b",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO "accounts" ("id", "nombre", "tipo", "saldo", "activa", "orden", "createdAt", "updatedAt", "userId")
        VALUES ('missing-owner', 'Missing', 'OPERATIVA', 0, true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
      `),
    ).rejects.toThrow();

    await expect(
      prisma.user.delete({ where: { id: "user-a" } }),
    ).rejects.toThrow();
    await expect(
      prisma.loan.delete({ where: { id: "loan-a" } }),
    ).rejects.toThrow();

    const loan = await prisma.loan.findUnique({ where: { id: "loan-a" }, include: { devoluciones: true } });
    expect(loan?.devoluciones).toHaveLength(1);
    expect(loan?.devoluciones[0]?.transactionId).toBe("transaction-repayment");

    const migration = readFileSync(join(migrationsRoot, enforcementMigration, "migration.sql"), "utf8");
    expect(migration).toContain("paymentTransactionId");
    expect(migration).toContain('DROP INDEX "categories_nombre_key"');
  });
});
