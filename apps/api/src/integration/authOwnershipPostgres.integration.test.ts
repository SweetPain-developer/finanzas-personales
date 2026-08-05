import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import request from "supertest";
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
  let applicationPrisma: PrismaClient;
  let application: typeof import("../app.js").app;
  let createSessionToken: typeof import("../auth/session.js").createSessionToken;
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
        (${"category-a"}, ${"Food"}, ${"food"}, ${"GASTO"}::"CategoryType", ${0}, ${"user-a"}),
        (${"category-b"}, ${"B food"}, ${"food"}, ${"GASTO"}::"CategoryType", ${0}, ${"user-b"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "transactions" ("id", "tipo", "monto", "descripcion", "fecha", "createdAt", "updatedAt", "userId", "accountId", "categoryId") VALUES
        (${"transaction-a"}, ${"GASTO"}::"TransactionType", ${100}, ${"Loan delivery"}, ${new Date("2026-07-15T12:00:00.000Z")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"account-a"}, ${"category-a"}),
        (${"transaction-b"}, ${"GASTO"}::"TransactionType", ${50}, ${"B transaction"}, ${new Date("2026-07-15T12:00:00.000Z")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"}, ${"account-b"}, ${"category-b"}),
        (${"transaction-repayment"}, ${"INGRESO"}::"TransactionType", ${25}, ${"Loan repayment"}, ${new Date("2026-07-16T12:00:00.000Z")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"account-a"}, NULL),
        (${"transaction-repayment-b"}, ${"INGRESO"}::"TransactionType", ${20}, ${"B loan repayment"}, ${new Date("2026-07-16T12:00:00.000Z")}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"}, ${"account-b"}, NULL)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "commitment_templates" ("id", "nombre", "tipo", "montoDefault", "activa", "createdAt", "updatedAt", "userId") VALUES
        (${"template-a"}, ${"Internet"}, ${"RECURRENTE"}::"CommitmentType", ${50}, ${true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}),
        (${"template-b"}, ${"B internet"}, ${"RECURRENTE"}::"CommitmentType", ${40}, ${true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "commitments" ("id", "nombre", "tipo", "monto", "estado", "mes", "anio", "createdAt", "updatedAt", "userId", "templateId", "paymentTransactionId") VALUES
        (${"commitment-a"}, ${"Internet July"}, ${"RECURRENTE"}::"CommitmentType", ${50}, ${"PENDIENTE"}::"CommitmentStatus", ${7}, ${2026}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}, ${"template-a"}, NULL),
        (${"commitment-b"}, ${"B internet July"}, ${"RECURRENTE"}::"CommitmentType", ${40}, ${"PENDIENTE"}::"CommitmentStatus", ${7}, ${2026}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"}, ${"template-b"}, NULL)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "goals" ("id", "nombre", "montoObjetivo", "estado", "accountId", "createdAt", "updatedAt", "userId") VALUES
        (${"goal-a"}, ${"Emergency"}, ${5000}, ${"ACTIVA"}::"GoalStatus", ${"account-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-a"}),
        (${"goal-b"}, ${"B emergency"}, ${5000}, ${"ACTIVA"}::"GoalStatus", ${"account-b"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${"user-b"})
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "loans" ("id", "persona", "montoEntregado", "estado", "notas", "entregaTransactionId", "userId", "createdAt", "updatedAt") VALUES
        (${"loan-a"}, ${"Synthetic person"}, ${100}, ${"PENDIENTE"}::"LoanStatus", NULL, ${"transaction-a"}, ${"user-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${"loan-b"}, ${"B synthetic person"}, ${50}, ${"PENDIENTE"}::"LoanStatus", NULL, ${"transaction-b"}, ${"user-b"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "loan_repayments" ("id", "monto", "loanId", "transactionId", "userId", "createdAt", "updatedAt") VALUES
        (${"repayment-a"}, ${25}, ${"loan-a"}, ${"transaction-repayment"}, ${"user-a"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (${"repayment-b"}, ${20}, ${"loan-b"}, ${"transaction-repayment-b"}, ${"user-b"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    // Phase 2: backfill is represented by the synthetic userId assignments above;
    // the real runbook requires the guarded production backfill before this phase.
    cpSync(join(migrationsRoot, enforcementMigration), join(temporaryPrismaRoot, "migrations", enforcementMigration), {
      recursive: true,
    });
    runMigrations(temporaryPrismaRoot, integrationUrl);

    process.env.DATABASE_URL = integrationUrl;
    process.env.AUTH_JWT_SECRET = "p0-05-postgres-integration-secret";
    process.env.AUTH_COOKIE_SECURE = "false";
    process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
    ({ app: application } = await import("../app.js"));
    ({ createSessionToken } = await import("../auth/session.js"));
    ({ prisma: applicationPrisma } = await import("../prisma.js"));
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
    if (applicationPrisma && applicationPrisma !== prisma) {
      await applicationPrisma.$disconnect();
    }
    if (temporaryPrismaRoot) {
      rmSync(temporaryPrismaRoot, { recursive: true, force: true });
    }
  });

  function authCookie(userId: "user-a" | "user-b") {
    const email = userId === "user-a" ? "integration-a@example.test" : "integration-b@example.test";
    return `auth_token=${createSessionToken({ id: userId, email, displayName: userId })}`;
  }

  function api(userId: "user-a" | "user-b") {
    const cookie = authCookie(userId);
    return {
      get: (path: string) => request(application).get(path).set("Cookie", cookie),
      post: (path: string) => request(application).post(path).set("Cookie", cookie),
      patch: (path: string) => request(application).patch(path).set("Cookie", cookie),
      delete: (path: string) => request(application).delete(path).set("Cookie", cookie),
    };
  }

  it("keeps every published module isolated across authenticated users", async () => {
    const ownAccounts = await api("user-a").get("/accounts").expect(200);
    expect(ownAccounts.body.groups.flatMap((group: { accounts: { id: string }[] }) => group.accounts).map((account: { id: string }) => account.id)).toEqual(["account-a"]);
    const otherAccounts = await api("user-b").get("/accounts").expect(200);
    expect(otherAccounts.body.groups.flatMap((group: { accounts: { id: string }[] }) => group.accounts).map((account: { id: string }) => account.id)).toEqual(["account-b"]);

    const ownGoals = await api("user-a").get("/goals").expect(200);
    expect(ownGoals.body.groups.flatMap((group: { goals: { id: string }[] }) => group.goals).map((goal: { id: string }) => goal.id)).toEqual(["goal-a"]);
    expect((await api("user-b").get("/goals").expect(200)).body.groups.flatMap((group: { goals: { id: string }[] }) => group.goals).map((goal: { id: string }) => goal.id)).toEqual(["goal-b"]);

    const ownTemplates = await api("user-a").get("/commitment-templates").expect(200);
    expect(ownTemplates.body.templates.map((template: { id: string }) => template.id)).toEqual(["template-a"]);
    expect((await api("user-b").get("/commitment-templates").expect(200)).body.templates.map((template: { id: string }) => template.id)).toEqual(["template-b"]);

    const ownCommitments = await api("user-a").get("/commitments?month=2026-07").expect(200);
    expect(ownCommitments.body.groups.flatMap((group: { commitments?: { id: string }[]; items?: { id: string }[] }) => group.commitments ?? group.items ?? []).map((item: { id: string }) => item.id)).toContain("commitment-a");
    expect(JSON.stringify((await api("user-b").get("/commitments?month=2026-07").expect(200)).body)).not.toContain("commitment-a");

    const ownMovements = await api("user-a").get("/movements?month=2026-07").expect(200);
    expect(JSON.stringify(ownMovements.body)).not.toContain("transaction-b");
    expect(JSON.stringify((await api("user-b").get("/movements?month=2026-07").expect(200)).body)).not.toContain("transaction-a");

    const ownLoans = await api("user-a").get("/loans").expect(200);
    expect(ownLoans.body.loans.map((loan: { id: string }) => loan.id)).toEqual(["loan-a"]);
    expect((await api("user-b").get("/loans").expect(200)).body.loans.map((loan: { id: string }) => loan.id)).toEqual(["loan-b"]);

    await api("user-a").get("/loans/loan-b").expect(404);
    await api("user-a").patch("/accounts/account-b").send({ name: "tampered", type: "OPERATIVA", balance: 1000 }).expect(404);
    await api("user-a").delete("/accounts/account-b").expect(404);
    await api("user-a").patch("/goals/goal-b").send({ name: "tampered", targetAmount: 1, accountId: "account-b" }).expect(404);
    await api("user-a").delete("/goals/goal-b").expect(404);
    await api("user-a").patch("/commitment-templates/template-b").send({ activa: false }).expect(404);
    await api("user-a").delete("/commitment-templates/template-b").expect(404);
    await api("user-a").patch("/commitments/commitment-b").send({ nombre: "tampered", tipo: "RECURRENTE", monto: 40, month: "2026-07", fechaVencimiento: "2026-07-07" }).expect(404);
    await api("user-a").delete("/commitments/commitment-b").expect(404);
    await api("user-a").patch("/movements/transaction-b").send({ tipo: "GASTO", monto: 50, accountId: "account-b", categoryId: "category-b", fecha: "2026-07-15" }).expect(404);
    await api("user-a").delete("/movements/transaction-b").expect(404);
    await api("user-a").patch("/loans/loan-b").send({ persona: "tampered" }).expect(404);
    await api("user-a").delete("/loans/loan-b").expect(404);

    await api("user-a").post("/transactions").send({ tipo: "GASTO", monto: 10, accountId: "account-b", categoryId: "category-a" }).expect(400);
    await api("user-a").post("/transactions").send({ tipo: "GASTO", monto: 10, accountId: "account-a", categoryId: "category-b" }).expect(400);
    await api("user-a").post("/transactions").send({ tipo: "TRANSFERENCIA", monto: 10, fromAccountId: "account-a", toAccountId: "account-b" }).expect(400);
    await api("user-a").post("/goals").send({ name: "invalid", targetAmount: 100, accountId: "account-b" }).expect(400);
    await api("user-a").post("/loans").send({ persona: "invalid", montoEntregado: 10, accountId: "account-b" }).expect(400);
    await api("user-a").post("/loans/loan-a/repayments").send({ monto: 10, accountId: "account-b" }).expect(400);
    await api("user-a").post("/loans/loan-b/repayments").send({ monto: 10, accountId: "account-a" }).expect(404);

    await api("user-a").patch("/commitments/commitment-b/pay").send({ accountId: "account-a", categoryId: "category-a" }).expect(404);
    await api("user-a").patch("/commitments/commitment-b/unpay").expect(404);
    await api("user-a").patch("/commitments/commitment-a/pay").send({ accountId: "account-b", categoryId: "category-a" }).expect(400);
    expect((await prisma.commitment.findUnique({ where: { id: "commitment-a" } }))?.estado).toBe("PENDIENTE");
    await api("user-a").patch("/commitments/commitment-a/pay").send({ accountId: "account-a", categoryId: "category-a" }).expect(200);
    await api("user-b").patch("/commitments/commitment-a/unpay").expect(404);
    await api("user-a").patch("/commitments/commitment-a/unpay").expect(200);
    expect((await prisma.commitment.findUnique({ where: { id: "commitment-a" } }))?.estado).toBe("PENDIENTE");
  });

  it("enforces owner-scoped relationships, uniqueness, loans, and restrictive deletion", async () => {
    const categoryB = await prisma.category.create({
      data: { id: "category-b-uniqueness", nombre: "Food", icono: "food", tipo: "GASTO", orden: 0, userId: "user-b" },
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
    expect(loan?.entregaTransactionId).toBe("transaction-a");
    expect(loan?.devoluciones).toHaveLength(1);
    expect(loan?.devoluciones[0]?.transactionId).toBe("transaction-repayment");

    const migration = readFileSync(join(migrationsRoot, enforcementMigration, "migration.sql"), "utf8");
    expect(migration).toContain("paymentTransactionId");
    expect(migration).toContain('DROP INDEX "categories_nombre_key"');
  });
});
