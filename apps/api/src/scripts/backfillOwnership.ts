import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

import { hashPassword } from "../auth/password.js";

export const ownershipTables = [
  "accounts",
  "categories",
  "transactions",
  "commitment_templates",
  "commitments",
  "goals",
] as const;

export type OwnershipTable = (typeof ownershipTables)[number];
export type ExpectedCounts = Record<OwnershipTable, number>;
export type BackfillUser = { id: string; email: string; passwordHash?: string | null };

export type BackfillConfig = {
  email: string;
  password: string;
  expectedCounts: ExpectedCounts;
  rotatePassword: boolean;
};

export type BackfillRepository = {
  advisoryLock(): Promise<void>;
  listUsers(): Promise<BackfillUser[]>;
  countRows(table: OwnershipTable): Promise<number>;
  countNulls(table: OwnershipTable): Promise<number>;
  countConflicts(table: OwnershipTable, userId: string): Promise<number>;
  countOrphans(table: OwnershipTable): Promise<number>;
  countCrossOwnership(table: OwnershipTable): Promise<number>;
  countTransferOwnershipConflicts(): Promise<number>;
  createUser(email: string, passwordHash: string): Promise<{ id: string }>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  assignNullOwnership(table: OwnershipTable, userId: string): Promise<void>;
};

const confirmation = "local-finanzas-personales";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function databaseNameFromUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, "")).trim();
  if (!databaseName) throw new Error("DATABASE_URL must include a database name");
  return databaseName;
}

export function databaseHostAndPortFromUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname) {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol and include a host");
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_URL must include a valid PostgreSQL port");
  }
  return { host: url.hostname.toLowerCase(), port };
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function readExpectedCounts(raw: string | undefined): ExpectedCounts {
  if (!raw) throw new Error("OWNERSHIP_EXPECTED_COUNTS is required");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OWNERSHIP_EXPECTED_COUNTS must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OWNERSHIP_EXPECTED_COUNTS must be a JSON object");
  }
  const input = parsed as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  const expectedKeys = [...ownershipTables].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`OWNERSHIP_EXPECTED_COUNTS must contain exactly: ${ownershipTables.join(", ")}`);
  }
  const counts = {} as ExpectedCounts;
  for (const table of ownershipTables) {
    const value = input[table];
    if (!Number.isInteger(value) || (value as number) < 0) {
      throw new Error(`OWNERSHIP_EXPECTED_COUNTS contains an invalid count for ${table}`);
    }
    counts[table] = value as number;
  }
  return counts;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BackfillConfig {
  if (env.NODE_ENV === "production") throw new Error("Ownership backfill is forbidden when NODE_ENV=production");
  if (env.OWNERSHIP_BACKFILL_CONFIRM !== confirmation) {
    throw new Error(`OWNERSHIP_BACKFILL_CONFIRM must equal ${confirmation}`);
  }
  const databaseUrl = requiredEnvironment(env, "DATABASE_URL");
  const databaseName = databaseNameFromUrl(databaseUrl);
  const databaseTarget = databaseHostAndPortFromUrl(databaseUrl);
  const expectedDatabaseName = requiredEnvironment(env, "OWNERSHIP_BACKFILL_DATABASE_NAME").trim();
  if (!expectedDatabaseName || databaseName !== expectedDatabaseName) {
    throw new Error("DATABASE_URL database name does not match OWNERSHIP_BACKFILL_DATABASE_NAME");
  }
  const expectedDatabaseHost = requiredEnvironment(env, "OWNERSHIP_BACKFILL_DATABASE_HOST").trim().toLowerCase();
  const expectedDatabasePort = Number(requiredEnvironment(env, "OWNERSHIP_BACKFILL_DATABASE_PORT").trim());
  if (!expectedDatabaseHost || databaseTarget.host !== expectedDatabaseHost) {
    throw new Error("DATABASE_URL host does not match OWNERSHIP_BACKFILL_DATABASE_HOST");
  }
  if (!Number.isInteger(expectedDatabasePort) || expectedDatabasePort < 1 || expectedDatabasePort > 65535 || databaseTarget.port !== expectedDatabasePort) {
    throw new Error("DATABASE_URL port does not match OWNERSHIP_BACKFILL_DATABASE_PORT");
  }
  const email = normalizeEmail(requiredEnvironment(env, "INITIAL_USER_EMAIL"));
  const password = requiredEnvironment(env, "INITIAL_USER_PASSWORD");
  if (!email) throw new Error("INITIAL_USER_EMAIL must not be empty");
  if (!password) throw new Error("INITIAL_USER_PASSWORD must not be empty");
  return {
    email,
    password,
    expectedCounts: readExpectedCounts(env.OWNERSHIP_EXPECTED_COUNTS),
    rotatePassword: env.INITIAL_USER_ROTATE_PASSWORD === "true",
  };
}

async function verifyState(repository: BackfillRepository, config: BackfillConfig, userId: string) {
  for (const table of ownershipTables) {
    const actualCount = await repository.countRows(table);
    if (actualCount !== config.expectedCounts[table]) {
      throw new Error(`Expected count mismatch for ${table}`);
    }
    if (await repository.countConflicts(table, userId)) {
      throw new Error(`Conflicting userId values found in ${table}`);
    }
    if (await repository.countOrphans(table)) {
      throw new Error(`Orphaned userId values found in ${table}`);
    }
    if (await repository.countCrossOwnership(table)) {
      throw new Error(`Cross-user ownership relation found in ${table}`);
    }
  }
}

async function verifyNoNulls(repository: BackfillRepository) {
  for (const table of ownershipTables) {
    if (await repository.countNulls(table)) throw new Error(`Residual NULL userId values found in ${table}`);
  }
}

export async function executeBackfill(repository: BackfillRepository, config: BackfillConfig, hash = hashPassword) {
  await repository.advisoryLock();
  // Counts are checked before creating or updating the owner and again after assignment.
  for (const table of ownershipTables) {
    if (await repository.countRows(table) !== config.expectedCounts[table]) {
      throw new Error(`Expected count mismatch for ${table}`);
    }
  }

  const matchingUsers = (await repository.listUsers()).filter((user) => normalizeEmail(user.email) === config.email);
  if (matchingUsers.length > 1) throw new Error("More than one existing user matches the normalized email");

  let userId: string;
  if (matchingUsers.length === 1) {
    userId = matchingUsers[0].id;
    if (config.rotatePassword) await repository.updatePassword(userId, await hash(config.password));
  } else {
    userId = (await repository.createUser(config.email, await hash(config.password))).id;
  }

  await verifyState(repository, config, userId);
  for (const table of ownershipTables) await repository.assignNullOwnership(table, userId);
  await verifyNoNulls(repository);
  await verifyState(repository, config, userId);
  if (await repository.countTransferOwnershipConflicts()) {
    throw new Error("Cross-user ownership relation found between transactions sharing a transferId");
  }
}

function sqlTable(table: OwnershipTable) {
  return Prisma.raw(`"${table}"`);
}

function createRepository(transaction: Prisma.TransactionClient): BackfillRepository {
  const count = async (query: Prisma.Sql) => Number((await transaction.$queryRaw<{ count: bigint }[]>(query))[0]?.count ?? 0n);
  return {
    advisoryLock: async () => {
      await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('finanzas-personales:ownership-backfill', 0))`);
    },
    listUsers: () => transaction.user.findMany({ select: { id: true, email: true, passwordHash: true } }),
    countRows: (table) => count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${sqlTable(table)}`),
    countNulls: (table) => count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${sqlTable(table)} WHERE "userId" IS NULL`),
    countConflicts: (table, userId) => count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${sqlTable(table)} WHERE "userId" IS NOT NULL AND "userId" <> ${userId}`),
    countOrphans: (table) => count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${sqlTable(table)} AS owned LEFT JOIN "users" AS owner ON owner."id" = owned."userId" WHERE owned."userId" IS NOT NULL AND owner."id" IS NULL`),
    countCrossOwnership: (table) => {
      const queries: Record<OwnershipTable, Prisma.Sql> = {
        accounts: Prisma.sql`SELECT 0::bigint AS count`,
        categories: Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "transactions" AS row JOIN "categories" AS related ON related."id" = row."categoryId" WHERE row."userId" IS NOT NULL AND related."userId" IS NOT NULL AND row."userId" <> related."userId"`,
        transactions: Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "transactions" AS row JOIN "accounts" AS related ON related."id" = row."accountId" WHERE row."userId" IS NOT NULL AND related."userId" IS NOT NULL AND row."userId" <> related."userId"`,
        commitment_templates: Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "commitments" AS row JOIN "commitment_templates" AS related ON related."id" = row."templateId" WHERE row."userId" IS NOT NULL AND related."userId" IS NOT NULL AND row."userId" <> related."userId"`,
        commitments: Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "commitments" AS row JOIN "transactions" AS related ON related."id" = row."paymentTransactionId" WHERE row."userId" IS NOT NULL AND related."userId" IS NOT NULL AND row."userId" <> related."userId"`,
        goals: Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "goals" AS row JOIN "accounts" AS related ON related."id" = row."accountId" WHERE row."userId" IS NOT NULL AND related."userId" IS NOT NULL AND row."userId" <> related."userId"`,
      };
      return count(queries[table]);
    },
    countTransferOwnershipConflicts: () => count(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM (SELECT "transferId" FROM "transactions" WHERE "transferId" IS NOT NULL AND "userId" IS NOT NULL GROUP BY "transferId" HAVING COUNT(DISTINCT "userId") > 1) AS conflicting_transfers`),
    createUser: async (email, passwordHash) => transaction.user.create({ data: { email, passwordHash }, select: { id: true } }),
    updatePassword: async (id, passwordHash) => { await transaction.user.update({ where: { id }, data: { passwordHash } }); },
    assignNullOwnership: async (table, userId) => { await transaction.$executeRaw(Prisma.sql`UPDATE ${sqlTable(table)} SET "userId" = ${userId} WHERE "userId" IS NULL`); },
  };
}

export async function runBackfill(client: PrismaClient, config: BackfillConfig) {
  await client.$transaction(async (transaction) => executeBackfill(createRepository(transaction), config));
}

async function main() {
  const config = readConfig();
  const client = new PrismaClient();
  try {
    await runBackfill(client, config);
    console.log("Ownership backfill completed successfully.");
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith("backfillOwnership.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Ownership backfill failed.");
    process.exitCode = 1;
  });
}
